type PadValue = number | 'replicate';

type PadMode = 'none' | 'pre' | 'post';

export interface SavitzkyGolayOptions {
  windowSize: number;
  derivative?: number;
  polynomial?: number;
  pad?: PadMode;
  padValue?: PadValue;
}

const defaultOptions: Required<SavitzkyGolayOptions> = {
  windowSize: 5,
  derivative: 1,
  polynomial: 2,
  pad: 'none',
  padValue: 'replicate'
};

const createMatrix = (rows: number, cols: number, fill = 0): number[][] =>
  Array.from({ length: rows }, () => Array(cols).fill(fill));

const transpose = (matrix: number[][]): number[][] =>
  matrix[0].map((_, col) => matrix.map(row => row[col]));

const multiplyMatrices = (a: number[][], b: number[][]): number[][] => {
  const rows = a.length;
  const cols = b[0].length;
  const shared = b.length;
  const result = createMatrix(rows, cols);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < shared; k++) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  }

  return result;
};

const invertMatrix = (matrix: number[][]): number[][] => {
  const n = matrix.length;
  const eps = 1e-12;
  const augmented = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: n }, (_, idx) => (rowIndex === idx ? 1 : 0))
  ]);

  for (let i = 0; i < n; i++) {
    let pivot = augmented[i][i];
    if (Math.abs(pivot) < eps) {
      throw new Error('Cannot invert singular matrix');
    }

    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === i) continue;
      const factor = augmented[row][i];
      for (let col = i; col < 2 * n; col++) {
        augmented[row][col] -= factor * augmented[i][col];
      }
    }
  }

  return augmented.map(row => row.slice(n));
};

const padArray = (data: number[], size: number, padValue: PadValue): number[] => {
  if (size <= 0) return data.slice();
  if (data.length === 0) {
    const fill = typeof padValue === 'number' ? padValue : 0;
    return Array(size * 2).fill(fill);
  }

  const resolvedValue = typeof padValue === 'number' ? padValue : undefined;
  const front = Array(size).fill(resolvedValue ?? data[0]);
  const back = Array(size).fill(resolvedValue ?? data[data.length - 1]);

  return [...front, ...data, ...back];
};

export const savitzkyGolay = (
  data: number[],
  h: number,
  options: SavitzkyGolayOptions
): number[] => {
  const opts: Required<SavitzkyGolayOptions> = { ...defaultOptions, ...options } as Required<SavitzkyGolayOptions>;

  if (opts.windowSize % 2 === 0 || opts.windowSize < 5 || !Number.isInteger(opts.windowSize)) {
    throw new RangeError('Invalid window size (should be odd and at least 5 integer number)');
  }
  if (opts.derivative! < 0 || !Number.isInteger(opts.derivative!)) {
    throw new RangeError('Derivative should be a positive integer');
  }
  if (opts.polynomial! < 1 || !Number.isInteger(opts.polynomial!)) {
    throw new RangeError('Polynomial should be a positive integer');
  }

  const step = Math.floor(opts.windowSize / 2);
  let source = data.slice();

  if (opts.pad === 'pre') {
    source = padArray(source, step, opts.padValue);
  }

  const ansLength = source.length - 2 * step;
  if (ansLength <= 0) {
    return [];
  }

  let coefficients: number[];
  let norm = 1;

  if (opts.windowSize === 5 && opts.polynomial === 2 && (opts.derivative === 1 || opts.derivative === 2)) {
    if (opts.derivative === 1) {
      coefficients = [-2, -1, 0, 1, 2];
      norm = 10;
    } else {
      coefficients = [2, -1, -2, -1, 2];
      norm = 7;
    }
  } else {
    const matrix = createMatrix(opts.windowSize, opts.polynomial! + 1, 1);
    const start = -(opts.windowSize - 1) / 2;

    for (let row = 0; row < matrix.length; row++) {
      for (let col = 0; col < matrix[row].length; col++) {
        matrix[row][col] = Math.pow(start + row, col);
      }
    }

    const transposed = transpose(matrix);
    const gram = multiplyMatrices(transposed, matrix);
    const inverse = invertMatrix(gram);
    const weights = multiplyMatrices(inverse, transposed);
    coefficients = weights[opts.derivative!];
  }

  const det = norm * Math.pow(h, opts.derivative!);
  const output = new Array(ansLength);

  for (let k = step; k < source.length - step; k++) {
    let sum = 0;
    for (let l = 0; l < coefficients.length; l++) {
      sum += (coefficients[l] * source[l + k - step]) / det;
    }
    output[k - step] = sum;
  }

  if (opts.pad === 'post') {
    return padArray(output, step, opts.padValue);
  }

  return output;
};
