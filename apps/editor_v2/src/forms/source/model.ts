import type { Settings } from "../core/settings";

/** A bounded authoring dialect; version 2 makes logic blocks own answer-dependent behavior. */
export type Diagnostic = {
  code: string;
  message: string;
  severity: "fatal" | "warning";
  line: number;
  column: number;
  sourceKey?: string;
};

export type NodeState = {
  settings?: Settings;
  properties?: Settings;
  state?: Settings;
  identity?: string;
};

export type SourceOption = { key?: string; text: string; node?: NodeState; blocks: SourceBlock[] };

export type SourceQuestion = {
  type: "question";
  key: string;
  kind: string;
  label?: string;
  hints: SourceBlock[];
  settings: Settings;
  labelNode?: NodeState;
  answerNode?: NodeState;
  options?: SourceOption[];
  explicit?: string[];
  identity?: string;
};

export type SourceContent = {
  type: "content";
  kind: string;
  text: string;
  key?: string;
  node?: NodeState;
  blocks?: SourceBlock[];
};

export type SourceBlock = SourceQuestion | SourceContent;

export type SourcePage = {
  key?: string;
  type: string;
  title: string;
  description?: string;
  settings: Settings;
  startNode?: NodeState;
  titleNode?: NodeState;
  descriptionNode?: NodeState;
  blocks: SourceBlock[];
};

export type FormDocument = {
  formatVersion: 1 | 2;
  title: string;
  settings: Settings;
  unknown: Settings;
  titleNode?: NodeState;
  pages: SourcePage[];
};
