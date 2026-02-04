declare module 'kalmanjs' {
  export interface KalmanFilterOptions {
    R?: number;
    Q?: number;
    A?: number;
    B?: number;
    C?: number;
  }

  class KalmanFilter {
    constructor(opts?: KalmanFilterOptions);
    filter(value: number): number;
  }

  export default KalmanFilter;
}
