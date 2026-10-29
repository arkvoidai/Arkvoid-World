import { useState, useRef, useEffect, type ClipboardEvent, type KeyboardEvent, type ChangeEvent } from 'react';
import { Sheet } from '@/ui/Sheet';
import { useAuthStore } from '@/state/auth';
import { ACCOUNT_COPY } from '@/config/copy';

export interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AccountSheet({ open, onClose }: AccountSheetProps) {
  const {
    status,
    user,
    emailResendCooldown,
    emailLockoutSeconds,
    sessionFailedMessage,
    error: authError,
    signInGuest,
    sendEmailCode,
    upgradeGuestWithEmail,
    verifyEmailCode,
    signInWithGoogle,
    linkGoogle,
    signOut,
    deleteMyData,
  } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'options' | 'email'>('options');
  const [emailInput, setEmailInput] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset local state when opened/closed
  useEffect(() => {
    if (!open) {
      setActiveTab('options');
      setEmailInput('');
      setCodeSent(false);
      setCodeDigits(['', '', '', '', '', '']);
      setIsSubmitting(false);
      setConfirmDelete(false);
      setLocalMessage(null);
    }
  }, [open]);

  // Autofocus first digit box once code is sent
  useEffect(() => {
    if (codeSent && digitRefs.current[0]) {
      digitRefs.current[0].focus();
    }
  }, [codeSent]);

  const handleSendEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) return;
    setIsSubmitting(true);
    setLocalMessage(null);

    let ok = false;
    if (status === 'guest') {
      ok = await upgradeGuestWithEmail(emailInput.trim());
    } else {
      ok = await sendEmailCode(emailInput.trim());
    }

    setIsSubmitting(false);
    if (ok) {
      setCodeSent(true);
      setLocalMessage(ACCOUNT_COPY.codeSent);
    }
  };

  const handleDigitChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    const newDigits = [...codeDigits];

    if (val.length === 0) {
      newDigits[index] = '';
      setCodeDigits(newDigits);
      return;
    }

    // Take the last entered character if multiple
    newDigits[index] = val.slice(-1);
    setCodeDigits(newDigits);

    // Auto-advance to next input
    if (index < 5 && val.length > 0) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      e.preventDefault();
      const prev = digitRefs.current[index - 1];
      if (prev) {
        prev.focus();
        const newDigits = [...codeDigits];
        newDigits[index - 1] = '';
        setCodeDigits(newDigits);
      }
    }
  };

  const handleDigitPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...codeDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setCodeDigits(newDigits);

    const nextIndex = Math.min(pasted.length, 5);
    digitRefs.current[nextIndex]?.focus();

    if (pasted.length === 6) {
      handleVerifyCode(pasted);
    }
  };

  const handleVerifyCode = async (explicitCode?: string) => {
    const token = explicitCode || codeDigits.join('');
    if (token.length !== 6 || !emailInput) return;

    setIsSubmitting(true);
    setLocalMessage(null);
    const ok = await verifyEmailCode(emailInput.trim(), token);
    setIsSubmitting(false);

    if (ok) {
      onClose();
    }
  };

  const handleGoogleAuth = async () => {
    if (status === 'guest') {
      await linkGoogle();
    } else {
      await signInWithGoogle();
    }
  };

  const handleDeleteData = async () => {
    setIsSubmitting(true);
    const ok = await deleteMyData();
    setIsSubmitting(false);
    if (ok) {
      onClose();
    }
  };

  const isGuest = status === 'guest';
  const isMember = status === 'member';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isMember ? 'Account' : ACCOUNT_COPY.sheetTitle}
      initialDetent="medium"
    >
      <div className="flex flex-col gap-5 pt-2 pb-6 font-sans text-ink">
        {/* Session Failed Notification */}
        {sessionFailedMessage && (
          <div className="rounded-card border border-orange/40 bg-orange/10 p-4">
            <p className="font-serif text-sm text-ink">{ACCOUNT_COPY.sessionFailedNote}</p>
            <button
              type="button"
              onClick={() => signInGuest()}
              className="mt-3 rounded-pill border border-orange/40 bg-surface px-4 py-2 font-medium text-xs text-ink hover:bg-orange/20 transition-colors"
            >
              {ACCOUNT_COPY.startNewGuest}
            </button>
          </div>
        )}

        {/* Member Status View */}
        {isMember && (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-line bg-surface p-4">
              <span className="text-xs uppercase tracking-widest text-muted block mb-1">
                Signed In
              </span>
              <p className="font-mono text-sm text-ink truncate">
                {user?.email || 'Wanderer'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="w-full rounded-pill border border-line bg-surface py-2.5 text-xs font-medium text-ink hover:bg-sand transition-colors"
            >
              {ACCOUNT_COPY.signOut}
            </button>
          </div>
        )}

        {/* Guest Path Preservation */}
        {isGuest && (
          <div className="flex flex-col gap-4">
            <p className="font-serif text-sm leading-relaxed text-ink-2">
              {ACCOUNT_COPY.guestNote}
            </p>

            {activeTab === 'options' ? (
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('email')}
                  className="w-full rounded-pill border border-line bg-surface py-3 text-xs font-medium text-ink hover:bg-sand transition-colors"
                >
                  {ACCOUNT_COPY.emailChoice}
                </button>
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className="w-full rounded-pill border border-line bg-surface py-3 text-xs font-medium text-ink hover:bg-sand transition-colors"
                >
                  {ACCOUNT_COPY.googleChoice}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {!codeSent ? (
                  <form onSubmit={handleSendEmail} className="flex flex-col gap-3">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={ACCOUNT_COPY.enterEmail}
                      autoFocus
                      required
                      className="w-full rounded-card border border-line bg-surface px-4 py-2.5 font-mono text-xs text-ink outline-none focus:border-ink transition-colors"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('options')}
                        className="rounded-pill border border-line bg-surface px-4 py-2.5 text-xs text-muted hover:text-ink transition-colors"
                      >
                        {ACCOUNT_COPY.cancel}
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || emailLockoutSeconds > 0}
                        className="flex-1 rounded-pill border border-line bg-sand py-2.5 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50 transition-colors"
                      >
                        {isSubmitting
                          ? 'Sending...'
                          : emailLockoutSeconds > 0
                          ? `Locked for ${emailLockoutSeconds}s`
                          : ACCOUNT_COPY.sendCodeButton}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-4">
                    <p className="font-serif text-xs text-muted">{ACCOUNT_COPY.enterCode}</p>
                    <div className="flex justify-between gap-2" onPaste={handleDigitPaste}>
                      {codeDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            digitRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          pattern="[0-9]*"
                          value={digit}
                          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                          onChange={(e) => handleDigitChange(idx, e)}
                          onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                          className="h-12 w-11 rounded-card border border-line bg-surface text-center font-mono text-lg font-medium text-ink outline-none focus:border-ink transition-colors"
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        disabled={emailResendCooldown > 0 || emailLockoutSeconds > 0 || isSubmitting}
                        onClick={() => handleSendEmail()}
                        className="text-xs text-muted hover:text-ink disabled:opacity-40 transition-colors"
                      >
                        {emailResendCooldown > 0
                          ? `Resend in ${emailResendCooldown}s`
                          : emailLockoutSeconds > 0
                          ? `Try again in ${emailLockoutSeconds}s`
                          : ACCOUNT_COPY.resendCode}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCodeSent(false)}
                        className="text-xs text-muted hover:text-ink transition-colors"
                      >
                        Change email
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={codeDigits.join('').length !== 6 || isSubmitting}
                      onClick={() => handleVerifyCode()}
                      className="w-full rounded-pill border border-line bg-sand py-3 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? 'Verifying...' : ACCOUNT_COPY.verifyCode}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Feedback Messages */}
        {localMessage && (
          <p className="font-serif text-xs text-ink-2">{localMessage}</p>
        )}
        {authError && (
          <p className="font-serif text-xs text-orange">{authError}</p>
        )}

        {/* Delete My Data Zone (Two-step confirm) */}
        <div className="mt-4 pt-4 border-t border-line/60">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-muted hover:text-orange transition-colors"
            >
              {ACCOUNT_COPY.deleteData}
            </button>
          ) : (
            <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
              <p className="font-serif text-xs text-ink">{ACCOUNT_COPY.confirmDeletePrompt}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleDeleteData}
                  className="rounded-pill border border-orange/40 bg-orange/15 px-3 py-1.5 text-xs font-medium text-ink hover:bg-orange/25 transition-colors"
                >
                  {ACCOUNT_COPY.confirmDeleteButton}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs text-muted hover:text-ink transition-colors"
                >
                  {ACCOUNT_COPY.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
