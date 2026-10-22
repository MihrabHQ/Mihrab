/**
 * A foldable on Android: the phone/large class follows the screen, the hinge
 * is read as a posture, and sheets keep off it. These hold the pure halves;
 * the layouts that use them were checked on the Pixel 9 Pro Fold emulator.
 */
import { deviceClassOf } from '../src/responsive/deviceClass';
import { bookPanePadding, postureFrom } from '../src/native/FoldPosture';
import { sheetSides, SHEET_MAX_WIDTH } from '../src/responsive/sheetSides';
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the device class follows the screen', () => {
  it('reads a cover screen as a phone and the inner screen as large', () => {
    expect(deviceClassOf({ width: 411, height: 914 })).toBe('phone');
    expect(deviceClassOf({ width: 852, height: 883 })).toBe('large');
  });

  it('is never kept from launch', () => {
    // A constant answered at import is what kept the phone reader on an
    // unfolded screen; nothing may bring one back.
    expect(read('src/responsive/deviceClass.ts')).not.toMatch(/export const DEVICE_CLASS/);
    expect(read('src/quran/MushafReader.tsx')).toMatch(/const deviceClass = useDeviceClass\(\);/);
  });

  it('opens the new reader on the page the old one was showing', () => {
    const reader = read('src/quran/MushafReader.tsx');
    expect(reader).toMatch(/setOpenAt\(lastPageRef\.current \?\? props\.initialPage\)/);
    expect(reader).toMatch(/initialPage: openAt,\s*onPageChange: onReaderPage,/);
  });
});

describe('the hinge, read as a posture', () => {
  const hinge = { left: 425, top: 0, right: 427, bottom: 883 };
  it('is a book half open with the hinge down the screen', () => {
    expect(postureFrom({ state: 'half', orientation: 'vertical', ...hinge })).toEqual({
      kind: 'book',
      hinge,
    });
  });
  it('is tabletop half open with the hinge across', () => {
    expect(postureFrom({ state: 'half', orientation: 'horizontal', ...hinge })?.kind).toBe('tabletop');
  });
  it('is nothing flat, closed, or without a hinge', () => {
    expect(postureFrom({ state: 'flat', orientation: 'vertical', ...hinge })).toBeNull();
    expect(postureFrom({ state: 'none' })).toBeNull();
    expect(postureFrom(null)).toBeNull();
  });
  it('keeps a column to the first page of the book, by the language', () => {
    const book = postureFrom({ state: 'half', orientation: 'vertical', ...hinge });
    expect(bookPanePadding(book, 852, false)).toEqual({ paddingRight: 852 - 425 });
    expect(bookPanePadding(book, 852, true)).toEqual({ paddingLeft: 427 });
    expect(bookPanePadding(null, 852, false)).toBeNull();
  });
});

describe('bottom sheets on a wide Android screen', () => {
  it('are unchanged on iOS and on a phone', () => {
    expect(sheetSides({ android: false, width: 1000, rtl: false, book: null })).toEqual({ left: 0, right: 0 });
    expect(sheetSides({ android: true, width: 411, rtl: false, book: null })).toEqual({ left: 0, right: 0 });
  });
  it('keep a phone width in the middle of a wide one', () => {
    const s = sheetSides({ android: true, width: 852, rtl: false, book: null });
    expect(852 - s.left - s.right).toBe(SHEET_MAX_WIDTH);
    expect(s.left).toBe(s.right);
  });
  it('keep to one page of a book', () => {
    const book = { left: 425, right: 427 };
    expect(sheetSides({ android: true, width: 852, rtl: false, book })).toEqual({ left: 0, right: 427 });
    expect(sheetSides({ android: true, width: 852, rtl: true, book })).toEqual({ left: 427, right: 0 });
  });
});
