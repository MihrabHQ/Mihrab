/**
 * Every host the app's code names is accounted for.
 *
 * The privacy policy, the site and the store listings say what goes over
 * the network, and they were wrong for months because nothing tied them to
 * the code. This does: a host named anywhere in src/ must be listed in
 * PRIVACY_POLICY.md, or be one of the links below that the app only opens
 * in the browser (credits, store pages) and never fetches. A new service
 * fails here until the policy — and with it the site's privacy section and
 * the store paragraph — says what is sent to it.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

/** Opened in the browser when tapped, never fetched by the app. */
const LINK_ONLY: Record<string, string> = {
  'tanzil.net': 'attribution link',
  'quranpedia.net': 'attribution link (the data comes from api.quranpedia.net)',
  'alquran.cloud': 'attribution link; the text it derives from is bundled',
  'qul.tarteel.ai': 'attribution link',
  'api-docs.quran.com': 'attribution link',
  'mp3quran.net': 'attribution link (the audio comes from cdn.mp3quran.net)',
  'mihrab.elghamri.se': 'the website, opened from About',
  'play.google.com': 'Rate, opens the store',
  'apps.apple.com': 'Rate, opens the store',
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const hosts = new Map<string, string>();
for (const f of files(path.join(ROOT, 'src'))) {
  for (const m of readFileSync(f, 'utf-8').matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-z]{2,})/g)) {
    if (!hosts.has(m[1])) hosts.set(m[1], path.relative(ROOT, f));
  }
}
const policy = readFileSync(path.join(ROOT, 'PRIVACY_POLICY.md'), 'utf-8');

describe('the network the policy describes is the network the code uses', () => {
  it('finds the hosts', () => {
    expect(hosts.size).toBeGreaterThan(10);
  });

  it.each([...hosts.keys()].sort())('%s is in PRIVACY_POLICY.md, or only ever opened in the browser', host => {
    const listed = policy.includes(host) || host in LINK_ONLY;
    expect({ host, firstNamedIn: hosts.get(host), listed }).toEqual({ host, firstNamedIn: hosts.get(host), listed: true });
  });

  it('the link-only list holds nothing the code has stopped naming', () => {
    for (const h of Object.keys(LINK_ONLY)) expect({ h, named: hosts.has(h) }).toEqual({ h, named: true });
  });
});
