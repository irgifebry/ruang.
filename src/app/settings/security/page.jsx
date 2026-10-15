import { redirect } from 'next/navigation';

/**
 * The password form moved into /settings/profile as its third panel, so this
 * page has nothing left to show. It stays as a redirect so a bookmarked or
 * shared `/settings/security` link lands on the panel instead of a 404.
 */
export default function SecurityRedirect() {
  redirect('/settings/profile');
}