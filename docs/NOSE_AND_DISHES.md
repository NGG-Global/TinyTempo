# Nose blowing and washing up

Two acts join the rotation at levels 165 and 166, after two complete 29-act laps.
Levels 1–164 and every existing keepsake retain their assignments. Later looks
return every 31 levels: nose at 165/196/227/258, dishes at 166/197/228.
Each act also has scrapbook keepsakes for its first and second appearances.

`NoseBlowingVignette` has four people: swept hair, curls, silver hair with glasses,
and a bun with glasses. Each beat squeezes a tissue against the nose. At the ending
the hands lower: success exposes a broad smile, failure a runny nose.
`sfx/nose.wav` is the supplied Nose beat.WAV, copied unchanged. The sample bank
aligns its attack with the rhythm grid; a synthesized voice handles unavailable audio.

`DishCleaningVignette` cycles a ceramic plate, drinking glass, and fork/spoon/knife
set. The sponge scrubs on demo beats and player taps. Only judged hits remove dirt;
the demo does not consume it, and the last patch is reserved for success. Success
clears all remaining patches and adds glints. Failure leaves the remaining dirt.
Titles, introductions and ending copy follow the object on screen.

Both use the household lifecycle for pause, reset, layout, reduced motion and table
slides. Their five-beat holds leave room for the 1.2-second endings. Drawing and
synthesized ending sounds share the reveal timing in `cleaningMotion.ts`.

Development previews: `?debug&level=165`, `?debug&level=166`, `?debug&level=197`,
and `?debug&level=228`. Press the debug auto-play button for a clean round or leave
the response untapped for a failure.
