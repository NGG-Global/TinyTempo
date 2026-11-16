import { synthesizeFinale, type FinaleSynthRequest, type FinaleSynthReply } from './finaleSounds';

/**
 * The finale's sounds, synthesized off the main thread.
 *
 * One request in, one `Float32Array` out, transferred rather than copied. The synthesis
 * itself is `synthesizeFinale`, the same pure function the main thread runs when there is
 * no worker, so the samples are identical either way. Nothing here touches the DOM or an
 * AudioContext: the worker is told the sample rate and hands back numbers.
 */
const scope = self as unknown as {
  addEventListener(type: 'message', handler: (event: MessageEvent<FinaleSynthRequest>) => void): void;
  // The worker's `postMessage(message, transfer)`; the DOM lib types the window's, which takes a target origin.
  postMessage(message: FinaleSynthReply, transfer: Transferable[]): void;
};

scope.addEventListener('message', event => {
  const { id, sampleRate, kind, beatSec, rollBeats } = event.data;
  const samples = synthesizeFinale(sampleRate, kind, beatSec, rollBeats);
  scope.postMessage({ id, kind, samples }, [samples.buffer]);
});
