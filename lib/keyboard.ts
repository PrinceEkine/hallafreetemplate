import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * Bottom padding that keeps composers above the Android keyboard.
 *
 * The manifest sets adjustResize, but on some devices (edge-to-edge plus
 * react-native-screens) the window does not shrink and the composer ends
 * up behind the keyboard. When the keyboard shows, this hook waits briefly
 * for a resize; if the window height barely changed, it pads by the real
 * keyboard height instead. Where resize worked only partially (edge-to-edge
 * windows often shrink by less than the keyboard height), it pads exactly
 * the uncovered remainder, so the composer lands precisely on top of the
 * keyboard instead of slightly behind it. Where resize works fully, the pad
 * stays 0, so the composer never double-shifts. iOS always returns 0: the
 * KeyboardAvoidingView owns that platform.
 */
export function useAndroidKeyboardPad(): number {
  const [pad, setPad] = useState(0);
  const baseline = useRef(Dimensions.get('window').height);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const height = e.endCoordinates?.height ?? 0;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const shrunk = baseline.current - Dimensions.get('window').height;
        setPad(
          shrunk > 100
            ? Math.max(0, height - shrunk)
            : Math.max(0, height),
        );
      }, 300);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      baseline.current = Dimensions.get('window').height;
      setPad(0);
    });
    return () => {
      if (timer) clearTimeout(timer);
      show.remove();
      hide.remove();
    };
  }, []);

  return pad;
}

/**
 * True while the software keyboard is visible (both platforms). The chat
 * composer uses it to cancel its bottom safe-area inset while open: the
 * keyboard already covers the home indicator, so keeping the inset would
 * float the input above the keyboard with a visible gap.
 */
export function useKeyboardVisible(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return open;
}
