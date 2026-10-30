import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
} from 'react';
import { COLORS, GRADIENTS, RADII } from '@/config/tokens';
import { useGlass } from '@/ui/Glass';

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  {
    label,
    id: providedId,
    value,
    defaultValue,
    onFocus,
    onBlur,
    onChange,
    placeholder,
    className = '',
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const glassStyle = useGlass();

  const [focused, setFocused] = useState(false);
  const [internalHasValue, setInternalHasValue] = useState(() =>
    Boolean(
      (value !== undefined && String(value).length > 0) ||
        (defaultValue !== undefined && String(defaultValue).length > 0),
    ),
  );

  const hasValue =
    value !== undefined ? String(value).length > 0 : internalHasValue;
  const floated = focused || hasValue;

  return (
    <div
      className={`relative flex w-full items-center overflow-hidden ${className}`}
      style={{
        height: '48px',
        minHeight: '48px',
        borderRadius: RADII.field,
        ...glassStyle,
        border: focused
          ? `1px solid ${COLORS.lineStrong}`
          : `1px solid ${COLORS.line}`,
      }}
    >
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-4 origin-left select-none transition-transform duration-[180ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{
          color: COLORS.ink2,
          fontSize: '14px',
          lineHeight: 1.2,
          transform: floated
            ? 'translateY(-10px) scale(0.78)'
            : 'translateY(0px) scale(1)',
        }}
      >
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        value={value}
        defaultValue={defaultValue}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          setInternalHasValue(e.currentTarget.value.length > 0);
          onBlur?.(e);
        }}
        onChange={(e) => {
          setInternalHasValue(e.currentTarget.value.length > 0);
          onChange?.(e);
        }}
        placeholder={focused ? placeholder : undefined}
        className="h-full w-full bg-transparent px-4 pt-4 pb-1 text-body text-ink outline-none"
        {...rest}
      />
      {/* 2px Aurora focus accent hairline */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] transition-opacity duration-[180ms]"
        style={{
          backgroundImage: GRADIENTS.aurora,
          opacity: focused ? 1 : 0,
        }}
      />
    </div>
  );
});
