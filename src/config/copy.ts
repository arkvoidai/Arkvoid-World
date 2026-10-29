export const ERROR_MESSAGES = {
  NETWORK: 'The connection wavered. Reconnecting.',
  AUTH_EXPIRED: 'Your session has ended. Please sign in again.',
  RATE_LIMITED: 'Breathe and wait a moment.',
  VALIDATION: 'Please check what you entered.',
  FORBIDDEN: 'The path ahead is not open to you.',
  SERVER: 'The realm is momentarily quiet. Try again soon.',
  UNKNOWN: 'Something went quiet. Try again.',
} as const;

export const POSTGRES_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to continue.',
  bad_name: 'Choose a name between 2 and 24 characters.',
  bad_leaning: 'Choose dawn, dusk, or still.',
  bad_form: 'Choose a form from 0 to 3.',
  no_character: 'No wanderer found for this account.',
  rate_limited: 'Breathe and wait a moment.',
  bad_area: 'This area lies beyond reachable ground.',
  bad_pos: 'Coordinates are outside the realm bounds.',
  bad_duration: 'Retreat must be 15, 60, or 240 minutes.',
  bad_kind: 'Breath must be dawn or dusk.',
  bad_message: 'Message cannot be empty.',
  bad_reason: 'A reason is required.',
};

export const ACCOUNT_COPY = {
  sheetTitle: 'Save your path',
  guestNote: 'Your progress lives on this device. Add an email to keep it safe.',
  emailChoice: 'Email me a code',
  googleChoice: 'Continue with Google',
  sendCodeButton: 'Send code',
  resendCode: 'Resend code',
  verifyCode: 'Verify code',
  enterEmail: 'Your email address',
  enterCode: 'Enter the 6-digit code sent to your email.',
  codeSent: 'Code sent to your email.',
  signOut: 'Sign out',
  deleteData: 'Delete my data',
  confirmDeletePrompt: 'This permanently removes your wanderer and all Breath. Continue?',
  confirmDeleteButton: 'Permanently delete',
  cancel: 'Cancel',
  sessionFailedNote: 'Your guest session could not be renewed. You can start fresh with a new guest account.',
  startNewGuest: 'Start again as a new guest',
} as const;
