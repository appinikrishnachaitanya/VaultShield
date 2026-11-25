import { useReducer } from "react";
export type ReviewState = { text: string; consent: boolean };
export type ReviewAction =
  { type: "edit"; text: string } | { type: "consent"; value: boolean };
export function reviewReducer(
  state: ReviewState,
  action: ReviewAction,
): ReviewState {
  return action.type === "edit"
    ? { text: action.text, consent: false }
    : { ...state, consent: action.value };
}
export function useReviewedText() {
  const [state, dispatch] = useReducer(reviewReducer, {
    text: "",
    consent: false,
  });
  return {
    edit: state.text,
    consent: state.consent,
    setEdit: (text: string) => dispatch({ type: "edit", text }),
    setConsent: (value: boolean) => dispatch({ type: "consent", value }),
  };
}
