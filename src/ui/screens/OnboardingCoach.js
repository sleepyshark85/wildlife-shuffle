// S7 · Onboarding, the caption layer (AC-1206 to AC-1208).
//
// It is a card over the top of the real Game screen and it renders NOTHING the
// game does not already render. The board, the tray, the HUD and the action bar
// underneath it are the shipped ones, so a player who finishes onboarding has
// finished it on the screen they are about to play on — which is the whole of
// gameplay.md §11's "on the real board", and the reason there is no tutorial
// board, tutorial tray or tutorial animal anywhere in this codebase.
//
// `pointerEvents: 'box-none'` on the frame, and the card sits BELOW the HUD.
// Between them that is what keeps the beat playable: the board, the tray and
// the action bar all stay under the finger, and beat 3 in particular has to
// leave the tray visible, because the tray is the thing it is pointing at.
//
// Below the HUD rather than over it, because over it the card covered the
// Pause button — and Pause is where Settings lives, so a player who needed
// Reduce Motion could not reach it during the four beats that are their first
// four minutes with the game. What the card covers instead is the top of the
// board, which on every beat board is empty.
//
// This used to say "the empty DANGER BAND", and that was wrong: the band plus
// the ceiling row is four rows, and `docs/v2/layout-sweep.mjs` measures the
// card at 4.85 rows on a Pro Max, 6.47 on a 393x852 and 9.79 on an SE — over
// the band on every iPhone in the table and inside it only on an iPad. It
// costs nothing, because every beat board's top occupied row is y=1 and the
// card never reaches row 13, but the sweep asserts THAT rather than the band.
//
// Two states per beat. Before the gate fires the card asks for the action;
// after it fires the card confirms and waits for a tap. The wait is the point:
// the beat is over the instant the engine says so, and a caption that swapped
// on that frame would replace the sentence describing what just happened while
// it was still happening. The player advances when they have seen it.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BEATS, beatIndex } from '../onboarding.js';
import { RADIUS, SPACE, themed } from '../theme.js';
import { useTheme } from '../progressStore.js';
import { Button } from '../components/Controls.js';

/** ui.md §12's register: short, active, never cute. */
const ONBOARDING_COPY = Object.freeze({
  skip: 'Skip',
  next: 'Next',
  play: 'Play',
  done: 'Done',
});

export function OnboardingCoach({ beat, satisfied, onNext, onSkip, top }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const step = beatIndex(beat.id);
  const last = step === BEATS.length - 1;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.frame, { paddingTop: top + SPACE.sm }]}
      testID="onboarding"
    >
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={theme.type.label} testID="onboarding-step">
            {`Step ${step + 1} of ${BEATS.length}`}
          </Text>
          {/* AC-1206: skippable, from every beat, in one tap. It is a
              secondary control and it is never muted — a tutorial you cannot
              leave is a modal dialogue with extra steps. */}
          <Button
            label={ONBOARDING_COPY.skip}
            tone="secondary"
            testID="onboarding-skip"
            style={styles.skip}
            onPress={onSkip}
          />
        </View>
        <Text
          style={theme.type.title}
          testID="onboarding-title"
          accessibilityLiveRegion="polite"
        >
          {satisfied ? `${ONBOARDING_COPY.done} · ${beat.title}` : beat.title}
        </Text>
        <Text style={theme.type.body} testID="onboarding-body">{beat.body}</Text>
        {satisfied ? (
          <Button
            label={last ? ONBOARDING_COPY.play : ONBOARDING_COPY.next}
            testID="onboarding-next"
            onPress={onNext}
          />
        ) : null}
      </View>
    </View>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  // The fill comes from `StyleSheet.absoluteFill` AT THE CALL SITE, as an
  // element of the style array, and never by spreading it into this object.
  // `StyleSheet.absoluteFillObject` — which this used to spread — does not
  // exist in react-native 0.86; only `react-native-web` still ships it. So
  // `{...StyleSheet.absoluteFillObject}` spread `undefined` on the device,
  // silently, and this frame laid out as the LAST FLEX CHILD of the Game
  // screen's column instead of as an overlay: it took ~300 pt out of the
  // board's flex slot, the board overflowed its centred container in both
  // directions, and the card landed at the bottom of the screen under a tray
  // that was under the action bar. Spreading `absoluteFill` is not the fix
  // either — on web it is a compiled class handle, not a plain object.
  frame: {
    paddingHorizontal: SPACE.lg,
    // The board keeps the touches. Only the card itself takes them.
    pointerEvents: 'box-none',
  },
  card: {
    gap: SPACE.sm,
    padding: SPACE.lg,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: T.colors.accent,
    backgroundColor: T.colors.panel,
    pointerEvents: 'auto',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { paddingVertical: SPACE.xs, paddingHorizontal: SPACE.md },
}));
