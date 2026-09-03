export type Face = 'front' | 'back';

export type Diagnostic = {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
};

export type RowInstruction = {
  number: number;
  splitterLane: number;
  splitteeLanes: number[];
  sourceLine: number;
};

export type Repeat = {
  fromRow: number;
  throughRow: number;
  count?: number;
};

export type PatternAst = {
  colors: string[];
  rows: RowInstruction[];
  repeat?: Repeat;
};

export type ParseResult = {
  pattern?: PatternAst;
  diagnostics: Diagnostic[];
};

export type Cord = {
  id: string;
  colorSymbol: string;
};

export type Snapshot = {
  face: Face;
  lanes: Cord[];
};

export type SplitEvent = {
  eventIndex: number;
  rowInstance: number;
  sourceRow: number;
  splitIndex: number;
  splitCount: number;
  face: Face;
  splitterId: string;
  splitteeId: string;
  fromLane: number;
  toLane: number;
  lanesBefore: Cord[];
  lanesAfter: Cord[];
};

export type Simulation = {
  events: SplitEvent[];
  snapshots: Snapshot[];
  diagnostics: Diagnostic[];
  totalRows: number;
};
