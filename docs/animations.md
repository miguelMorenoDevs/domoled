# Animations

Every animation runs through the shared lifecycle in `src/animator/`: an intro plays once, the loop runs until an exit is requested, and an outro plays once. The LED matrix (`src/led/animations/`) and the [LG TV app](tv.md) (`lg-app/src/lg/animations/`) draw them separately, so the visuals can differ.

## CD

Used for tracks.

- Intro slide-in, then rotating album art with a silver rim and centre hole, floating motion and a light sheen.
- At the end of the track, or when the content changes, the outro fades out once. Then the new content appears.

## Podcast

Used for podcast episodes (Spotify reports them as `episode`).

- The artwork stays on the matrix while a dark shadow rises from the bottom edge, ripples across it and sinks back.
- The shadow is tinted from the artwork's dominant colour, so each episode gets its own palette.
- Same intro, loop and outro as the CD.

## Idle cat

Shown when authenticated with nothing playing.

- Intro: the calico cat jumps in from the left and lies down, closing its eyes.
- Loop: it sleeps for 10 s, stands up, stretches for 4 s and lies back down, until replaced.
- Outro: it opens its eyes, jumps out to the right, then the next content appears.
- It starts when playback stops or a track ends, and after a login with nothing playing.

## Login QR

Shown on the matrix (and the simulator) when no user is active. See [spotify.md](spotify.md) for the login flow.

## Failure

Shown when a playback poll fails: Spotify returns an error, cannot be reached or sends an unreadable reply, or the album art does not load. The matrix shows a red X. The TV shows a red ring with an X and the reason underneath. The next successful poll replaces it and loads the track again. The TV also shows the failure screen when it cannot reach the server within 3 seconds or loses the connection, with the message "Cannot reach the LED server.".
