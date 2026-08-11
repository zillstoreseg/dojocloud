import type { Transition, Variants } from 'motion/react';

/**
 * The product's motion language, in one place.
 *
 * Principle: motion explains, it does not perform. Anything here should make a
 * change of state easier to follow — where a thing came from, what it turned
 * into, that a number moved. If an animation only exists to be admired it does
 * not belong.
 *
 * Everything animates `transform` and `opacity` only, so nothing triggers
 * layout. Users with `prefers-reduced-motion` get the opacity half only —
 * enforced globally in globals.css and, for spring-driven values, by the
 * `useReducedMotion` checks in the components that use them.
 */

/** Durations, in seconds (Framer's unit). */
export const duration = {
  /** Hover, press, colour — should feel instant. */
  micro: 0.12,
  /** An element entering, expanding, or swapping. */
  element: 0.22,
  /** A whole page or panel transition. */
  page: 0.38,
} as const;

/** One curve for the whole product; a spring only where a drag is involved. */
export const ease = [0.32, 0.72, 0, 1] as const;

export const transition = {
  micro: { duration: duration.micro, ease },
  element: { duration: duration.element, ease },
  page: { duration: duration.page, ease },
  /** Drag / layout transitions, where a curve reads as mechanical. */
  spring: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
} satisfies Record<string, Transition>;

/** Gap between siblings in a staggered reveal. */
export const STAGGER = 0.06;

/** A single element rising into place. Pair with `staggerParent` for grids. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.page },
};

/** Fade only — the reduced-motion substitute for `riseIn`. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.element },
};

/** Parent of a grid or list whose children use `riseIn`. */
export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.04 } },
};

/** Page-level transition applied from `template.tsx`. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.page },
};

/**
 * Card lift on pointer hover. Kept small — 4px and a shadow swap reads as
 * "this is clickable", while a scale bump reads as a toy.
 */
export const cardHover = {
  rest: { y: 0 },
  hover: { y: -4, transition: transition.micro },
} satisfies Variants;

/**
 * Shared-element key for a coach moving from a directory card to their public
 * profile. Both ends must agree on the string, so it is generated here.
 */
export const coachLayoutId = (username: string) => `coach-${username}`;
