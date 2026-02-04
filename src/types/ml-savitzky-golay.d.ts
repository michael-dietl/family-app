declare module 'ml-savitzky-golay' {
  export interface SavitzkyGolayOptions {
    derivative?: number;
    polynomial?: number;
    pad?: 'none' | 'pre' | 'post';
    padValue?: number;
    windowSize: number;
  }

  function savitzkyGolay(values: number[], h: number, options: SavitzkyGolayOptions): number[];

  export default savitzkyGolay;
}
