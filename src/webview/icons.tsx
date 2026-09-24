import type { StatusKind } from '../domain/status';

/** 状態のアイコン（codicon の名前。~spin は回す） */
export const STATUS_ICONS: Record<StatusKind, string> = {
  draft: 'circle-large-outline',
  running: 'sync~spin',
  approval: 'shield',
  question: 'question',
  replied: 'comment',
  review: 'git-compare',
  done: 'check',
  failed: 'error',
  interrupted: 'debug-pause',
};

interface IconProps {
  /** codicon の名前。末尾の ~spin で回す */
  name: string;
  /** 足すクラス */
  extra?: string;
  /** そのほかの属性（data-* など） */
  [attribute: `data-${string}`]: string | undefined;
}

/** VS Code の codicon。飾りなので読み上げない */
export function Icon({ name, extra, ...rest }: IconProps) {
  const spin = name.endsWith('~spin');
  const base = spin ? name.slice(0, -'~spin'.length) : name;
  const classes = ['codicon', `codicon-${base}`];
  if (spin) {
    classes.push('codicon-modifier-spin');
  }
  if (extra !== undefined) {
    classes.push(extra);
  }
  return <i class={classes.join(' ')} aria-hidden="true" {...rest} />;
}
