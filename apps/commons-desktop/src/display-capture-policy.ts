type CaptureState = { contents: { mainFrame: unknown; isDestroyed(): boolean } | null; origin: string; generation: number; mode: string; changing: boolean };
type CaptureRequest = { frame: unknown; securityOrigin: string; userGesture: boolean; videoRequested: boolean };

export function trustedDisplayCapture(request: CaptureRequest, snapshot: CaptureState, state: CaptureState) {
  return !state.changing && state.generation === snapshot.generation && state.mode === snapshot.mode &&
    state.contents === snapshot.contents && !!state.contents && !state.contents.isDestroyed() &&
    request.frame === state.contents.mainFrame && request.securityOrigin === state.origin && request.userGesture && request.videoRequested;
}
