// The error the booking modules throw for a request they refuse. Callers branch on code, never on the message.

export class BookingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BookingError';
    this.code = code;
  }
}
