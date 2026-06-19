# Environment audio
The attached audio files can be used for applying some environmental sound effects.


| file name             | description             | license            | artist      | title                                   |
| --------------------- | ----------------------- | ------------------ | ----------- | --------------------------------------- |
| forest_night.wav      | Forest sounds Night     | Creative Commons 0 | Nox Sound   | Ambiance Nature Night Cricket Calm Loop |
| forest_day.wav        | Forest sounds Day       | Attribution 4.0    | Klankbeeld  | forest park october 1011 221030_0539    |
| footsteps_default.wav | Footsteps (default)     | Creative Commons 0 | minimilka   | footsteps simulation                    |
| jump_c04.wav          | Jump (default)          | Creative Commons 0 | Cabled Mess | Jump_C04                                |
| agua_jump1.wav        | Land in water (default) | Creative Commons 0 | Alex Eapo   | agua_jump1                              |

## Goal
Create another sound layer (SFX), this sound layer will be played simultaneously with the background-music layer.
The 'SFX' layer has multiple tracks, the idea is to provide ambient sound effects, based on player interactions (like walking, interacting) and based on time, or location in the world. This extra range of sounds will add to the immersive experience of the user while traversing the world.

## Forest sounds

### Settings
Add a volume slider for 'SFX: environment'

### Behavior
When in the world, there is always one sfx loop going on: the forest sounds. The forest sounds are tied to the clock cycle of the world, during daytime the forest will play `forest_day` (with birds), and during nighttime `forest_night` (with crickets). We will add other conditional sounds later, keep that in mind (cave, water, etc.).

## Footstep sounds
When the player walks, a footsteps sound can be played in a loop. While walking, this clip will start. When the player stops walking, the clip will pause. The clip will resume from the last point when resumed walking again. This will (sort of) give a random 'footstep' at first. Later, we will add different footsteps sounds for different walking conditions (water, solid vs grass, etc.), keep that in mind when making this.

## Jump sound
To give the jump a nicer response, play the jump sound when the player jumps.

## Splashing in the water
When jumping, and the player lands in water, play the agua_jump1 sound.
