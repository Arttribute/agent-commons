import { videoSampleTimes } from './video-sampling';

describe('video evidence sampling', () => {
  it('includes a decodable initial frame for a subsecond recording', () => {
    expect(videoSampleTimes(0.25)).toEqual([0]);
  });
  it('covers the end of a long workflow instead of only its first minute', () => {
    const times = videoSampleTimes(600);
    expect(times).toHaveLength(8);
    expect(times[0]).toBe(0);
    expect(times[7]).toBeCloseTo(599.8);
    expect(times.every((time, index) => index === 0 || time > times[index - 1])).toBe(true);
  });
  it('bounds configuration and rejects unmeasurable recordings', () => {
    expect(videoSampleTimes(600, Number.NaN)).toHaveLength(8);
    expect(videoSampleTimes(600, 1000)).toHaveLength(12);
    expect(() => videoSampleTimes(Number.NaN)).toThrow();
    expect(() => videoSampleTimes(0)).toThrow();
  });
});
