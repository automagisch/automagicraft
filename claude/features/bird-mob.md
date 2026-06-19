## Baseline
There is no mob behavior described yet. For a mob, there should be a base class to define other mobs from. This base class will ensure basic functionality: Movement, x and y position, default basic states. Then, from this baseline mobs can be created. Subclasses will define the detailed behavior and appearance and extra states. Build this class before building the mobs.

## Overall mob vibe
The mobs are cute creatures, they will take a light interest in the user when near (they will observe the player, or move around the player, no intentional following just signaling the presence of the player). They will lose the subtle interest once the player moves away from them. (interaction distance within 10 blocks, outside the 10 blocks the mobs will resume their normal behavior). Every behavior should feel finetuned to the type of mob, this will give every mob its own unique identity. Think of subtle varieties in movement speed, jumping vs walking, running away vs approaching.

The mobs should give a little life to the empty world.

## Bird
- it flies from tree to tree
- it will sit for a little while on a tree before flying to the next
- it will sometimes sit and walk on the surface for a short time
- sometimes they will take a long flight in a smooth motions
- it appears small, and has variety in color: yellow, brown, gray. Adhere the pastel color theme.
