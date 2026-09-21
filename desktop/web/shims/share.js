/**
 * react-native-share on the desktop. There is no share sheet on Windows or
 * Linux worth the name, so "share" a file means "save it where I choose",
 * and sharing text puts it on the clipboard.
 */
import { desktop } from './desktop';

const Share = {
  async open(options = {}) {
    const d = desktop();
    if (!d) throw new Error('User did not share');
    const urls = options.urls ?? (options.url ? [options.url] : []);
    if (urls.length === 0) {
      const text = [options.title, options.message].filter(Boolean).join('\n');
      await d.clipboard.write(text);
      return { success: true, message: 'copied' };
    }
    const saved = await d.share.saveFiles(urls, options.filename ?? options.title ?? null);
    if (!saved) {
      // Same shape as a dismissed share sheet, which the app treats as a
      // cancel rather than an error.
      throw new Error('User did not share');
    }
    return { success: true, message: saved };
  },
  async shareSingle(options) {
    return Share.open(options);
  },
  Social: {},
};

export default Share;
