export type { CalendarAdapter } from './calendar-adapter';
export type { EmailAdapter } from './email-adapter';
export type { DocumentAdapter } from './document-adapter';
export type { CalendarEvent, EmailThread, DocumentItem, WatchSubscription, DataProvider } from './types';
export { getCalendarAdapter, getEmailAdapter, getDocumentAdapter, getProvider } from './adapter-factory';
