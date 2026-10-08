import Phaser from 'phaser';

import { drawingBounds, type DrawingBounds } from '@/ui/graphicsBounds';

/**
 * A Graphics rasterised once and shown as one image, instead of tessellated on every frame.
 *
 * Phaser 4 walks a Graphics' whole command buffer and rebuilds its triangles on every frame
 * it renders — earcut for each fill, a quad per stroke segment — whether or not anything
 * changed (`docs/PERFORMANCE.md`). On the map that was three-quarters of the main thread's
 * time: ~74,000 vertices a frame, almost all of them road, scenery and chrome that move
 * only with the camera.
 *
 * The raster goes through Phaser's own **canvas** renderer for the Graphics, into a 2D
 * canvas, and the canvas is uploaded as a texture. A WebGL render target would be quicker
 * to fill but is not multisampled, so every edge baked there would lose the antialiasing it
 * has on screen; a 2D canvas antialiases every path itself. Strokes join with bevels, which
 * is what Phaser's WebGL stroke draws between segments.
 *
 * The Graphics is never discarded: it is what shows until the raster exists, whenever the
 * drawing cannot be bounded (`drawingBounds` refuses gradients and canvas transforms), and
 * after the WebGL context is lost and restored. A bake is an optimisation the picture never
 * depends on. The owner decides *when* to bake — one at a time, off the frames that matter —
 * through `ready` and `bake()`.
 */

/** The canvas renderer's entry point on a Graphics, which Phaser's typings leave out. */
interface CanvasDrawn {
  renderCanvas(renderer: unknown, src: Phaser.GameObjects.Graphics, camera: Phaser.Cameras.Scene2D.BaseCamera, parentMatrix: null, ctx: CanvasRenderingContext2D, allowClip: boolean): void;
}

/**
 * The longest edge a raster may have: 4096, or less where the GPU says so. Past it the
 * drawing simply stays live, which is how it was drawn before.
 */
const MAX_EDGE = 4096;

function maxEdge(renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer): number {
  const gl = (renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl as WebGLRenderingContext | undefined;
  const limit = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : MAX_EDGE;
  return Number.isFinite(limit) && limit > 0 ? Math.min(MAX_EDGE, limit) : MAX_EDGE;
}

/**
 * One canvas for every WebGL raster. A texture is uploaded from it and keeps no tie to it,
 * so nothing but the GPU copy outlives a bake. (Under the canvas renderer an image draws
 * from its canvas every frame, so there each layer keeps its own.)
 */
let scratch: HTMLCanvasElement | null = null;
let camera: Phaser.Cameras.Scene2D.BaseCamera | null = null;
let serial = 0;
/** Every layer with a raster, for a lost context to reach. */
const layers = new Set<BakedLayer>();
const watched = new WeakSet<object>();

/**
 * A restored WebGL context comes back without the uploads it had, and Phaser rebuilds a
 * canvas texture from its source canvas — here the scratch canvas, which by then holds
 * another bake or nothing. So every raster is dropped and its Graphics shows until its
 * owner bakes it again.
 */
function watchContext(renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer): void {
  if (watched.has(renderer)) return;
  watched.add(renderer);
  renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
    // Deleting from a Set while iterating it is defined: each layer is visited once.
    for (const layer of layers) layer.evict();
  });
}

function sameCommands(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class BakedLayer {
  /** The raster, posed where the drawing is; visible in its place once baked. */
  public readonly image: Phaser.GameObjects.Image;
  private readonly key: string;
  private own: HTMLCanvasElement | null = null;
  private baked = false;
  /** Drawn since the last raster, so the raster (if any) is out of date. */
  private stale = true;
  private shown = true;
  /** Where the drawing's local origin sits in the raster, in pixels: the image's origin. */
  private origin = { x: 0, y: 0 };
  private changedAt = 0;
  private destroyed = false;
  /** The commands the raster was made from, so a redraw that changes nothing keeps it. */
  private source: readonly number[] = [];

  /**
   * `clip` bounds the raster, in the Graphics' own coordinates, for a drawing whose fills
   * run past what can ever be seen — a band painted wider than the frame, say.
   */
  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly graphics: Phaser.GameObjects.Graphics,
    private readonly clip?: () => DrawingBounds | undefined,
  ) {
    this.key = `baked:${scene.sys.settings.key}:${++serial}`;
    this.image = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    // Next to its drawing in the display list, so the same depth sorts them as one object.
    const container = graphics.parentContainer;
    if (container) container.addAt(this.image, container.getIndex(graphics));
    else scene.children.moveBelow(this.image as never, graphics as never);
    this.follow();
    this.changedAt = scene.game.loop.frame;
    watchContext(scene.game.renderer);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Whether the raster is what is on screen. */
  public get isBaked(): boolean { return this.baked; }

  /**
   * Drawn, and not drawn again since the frame before this one: a layer redrawn every frame
   * (a press, a swing) is left live until it settles, rather than rasterised to be thrown away.
   */
  public get ready(): boolean {
    return !this.destroyed && this.stale && this.scene.game.loop.frame - this.changedAt >= 1;
  }

  /**
   * The drawing was redrawn. Call it once the drawing is complete. If the commands are the
   * ones the raster was made from — a layout that redraws the same sign, a resize that moves
   * nothing — the raster stays; otherwise the Graphics shows until the next bake.
   */
  public invalidate(): this {
    if (this.baked && sameCommands(this.graphics.commandBuffer as number[], this.source)) {
      this.follow();
      return this;
    }
    this.stale = true;
    this.changedAt = this.scene.game.loop.frame;
    this.drop();
    return this;
  }

  /**
   * Rasterise the drawing as it stands. False leaves the Graphics on screen: nothing is
   * drawn, it is too large, or it is a drawing the canvas renderer would not reproduce.
   */
  public bake(): boolean {
    if (this.destroyed) return false;
    const renderer = this.scene.game.renderer;
    const webgl = renderer.type === Phaser.WEBGL;
    // Nothing can be uploaded until the context is back; RESTORE_WEBGL brings it round again.
    if (webgl && (renderer as Phaser.Renderer.WebGL.WebGLRenderer).contextLost) return false;
    this.drop();
    this.stale = false;
    const graphics = this.graphics;
    const bounds = drawingBounds(graphics.commandBuffer as number[], this.clip?.());
    const edge = maxEdge(renderer);
    if (!bounds || bounds.width + 1 > edge || bounds.height + 1 > edge) return false;
    // The pose's fraction of a pixel goes into the raster, so where the drawing rests the
    // texture lands on whole pixels and is shown unresampled; one more pixel holds the shift.
    const fx = graphics.x - Math.floor(graphics.x), fy = graphics.y - Math.floor(graphics.y);
    const width = bounds.width + (fx > 0 ? 1 : 0), height = bounds.height + (fy > 0 ? 1 : 0);
    const canvas = webgl ? (scratch ??= document.createElement('canvas')) : (this.own ??= document.createElement('canvas'));
    // Resizing also clears it, and resets the context's state.
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.lineJoin = 'bevel';
    // A camera that is never pre-rendered: Phaser 4 keeps a camera's scroll in the matrix
    // `preRender` builds, so this one's is identity and the drawing is moved instead.
    camera ??= new Phaser.Cameras.Scene2D.BaseCamera(0, 0, 1, 1);
    camera.setScene(this.scene, false);
    camera.setViewport(0, 0, width, height);
    // Drawn in its own coordinates, offset into the canvas, and for that fraction of a pixel:
    // the rest of the pose is the image's.
    const pose = { x: graphics.x, y: graphics.y, rotation: graphics.rotation, scaleX: graphics.scaleX, scaleY: graphics.scaleY, alpha: graphics.alpha, sx: graphics.scrollFactorX, sy: graphics.scrollFactorY };
    graphics.setPosition(fx - bounds.x, fy - bounds.y).setRotation(0).setScale(1).setAlpha(1).setScrollFactor(1);
    try {
      (graphics as unknown as CanvasDrawn).renderCanvas(renderer, graphics, camera, null, context, false);
    } finally {
      camera.renderList.length = 0;
      graphics.setPosition(pose.x, pose.y).setRotation(pose.rotation).setScale(pose.scaleX, pose.scaleY).setAlpha(pose.alpha).setScrollFactor(pose.sx, pose.sy);
    }
    if (!this.scene.textures.addImage(this.key, canvas as unknown as HTMLImageElement)) return false;
    this.image.setTexture(this.key);
    this.source = (graphics.commandBuffer as number[]).slice();
    this.origin = { x: fx - bounds.x, y: fy - bounds.y };
    this.baked = true;
    layers.add(this);
    this.follow();
    return true;
  }

  /** Free the raster, keeping the drawing: the Graphics shows until the next bake. */
  public evict(): void {
    if (!this.baked) return;
    this.drop();
    this.stale = true;
  }

  public setVisible(on: boolean): this {
    this.shown = on;
    this.apply();
    return this;
  }

  public get visible(): boolean { return this.shown; }

  /** Pose the drawing and its raster together, as one object. */
  public setPosition(x: number, y: number): this {
    this.graphics.setPosition(x, y);
    this.follow();
    return this;
  }

  public setRotation(rotation: number): this {
    this.graphics.setRotation(rotation);
    this.follow();
    return this;
  }

  public setAlpha(alpha: number): this {
    this.graphics.setAlpha(alpha);
    this.image.setAlpha(alpha);
    return this;
  }

  /** The image takes the drawing's pose, with its origin where the drawing's local origin is. */
  private follow(): void {
    const g = this.graphics;
    const image = this.image;
    if (this.baked) image.setOrigin(this.origin.x / image.width, this.origin.y / image.height);
    image.setPosition(g.x, g.y).setRotation(g.rotation).setScale(g.scaleX, g.scaleY).setAlpha(g.alpha)
      .setScrollFactor(g.scrollFactorX, g.scrollFactorY);
    // Only on a change: every `setDepth` queues a sort of the whole display list.
    if (image.depth !== g.depth) image.setDepth(g.depth);
    this.apply();
  }

  private apply(): void {
    this.graphics.setVisible(this.shown && !this.baked);
    this.image.setVisible(this.shown && this.baked);
  }

  /** `live` is false once the scene is shutting down and the image may already be gone. */
  private drop(live = true): void {
    this.source = [];
    if (this.baked) {
      this.baked = false;
      layers.delete(this);
      if (live) {
        this.image.setTexture('__DEFAULT');
        this.apply();
      }
    }
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.drop(false);
    this.destroyed = true;
    layers.delete(this);
    if (this.own) {
      this.own.width = 1;
      this.own.height = 1;
      this.own = null;
    }
  }
}
