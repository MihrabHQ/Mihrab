/**
 * Mihrab Web's walkthrough: two questions, and the first one a guess put
 * as a question.
 */
import { buildOnboardingSteps, ONBOARDING_STEPS } from '../src/onboarding/steps';
import { placeFromAnswer } from '../src/onboarding/ipLocation';

describe('the web walkthrough', () => {
  it('asks where, then whether to notify — and the apps keep all six', () => {
    expect(buildOnboardingSteps(false, true)).toEqual(['location', 'alerts']);
    expect(buildOnboardingSteps(true, true)).toEqual(['alerts']);
    expect(buildOnboardingSteps(false)).toEqual([...ONBOARDING_STEPS]);
  });
});

describe('an IP lookup read as a place', () => {
  const answer = (o: Partial<Record<'lat' | 'lng' | 'city' | 'region' | 'country', unknown>>) => ({
    lat: '59.33',
    lng: '18.07',
    city: 'Stockholm',
    region: 'Stockholm',
    country: 'Sweden',
    ...o,
  });

  it('takes GeoJS strings and ipapi numbers alike', () => {
    expect(placeFromAnswer(answer({}))).toEqual({ latitude: 59.33, longitude: 18.07, label: 'Stockholm, Sweden' });
    expect(placeFromAnswer(answer({ lat: 30.04, lng: 31.24, city: 'Cairo', country: 'Egypt' }))?.label).toBe('Cairo, Egypt');
  });

  it('falls back to the region when the city is unknown', () => {
    expect(placeFromAnswer(answer({ city: '' }))?.label).toBe('Stockholm, Sweden');
    expect(placeFromAnswer(answer({ city: undefined, region: 'Skåne' }))?.label).toBe('Skåne, Sweden');
  });

  it('offers nothing rather than a wrong place', () => {
    expect(placeFromAnswer(answer({ lat: 'nil' }))).toBeNull();
    expect(placeFromAnswer(answer({ lat: 0, lng: 0 }))).toBeNull();
    expect(placeFromAnswer(answer({ lat: 95 }))).toBeNull();
    expect(placeFromAnswer(answer({ city: '', region: '', country: '' }))).toBeNull();
  });
});
