import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEventType(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

/**
 * Format a stored phone string for display as (XXX) XXX-XXXX.
 * Returns the value as-is if it doesn't contain exactly 10 digits.
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Format a phone number as the user types, producing (XXX) XXX-XXXX.
 * Strips non-digits and applies the mask up to 10 digits.
 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
