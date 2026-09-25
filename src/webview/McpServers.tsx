import { useState } from 'preact/hooks';
import type { McpServerInfo, McpStatus } from '../domain/mcp';
import type { PanelStrings } from './protocol';
import { Scroll } from './Scroll';

/** MCP サーバーの状態を並べる順。手当てが要るものを先に */
const MCP_ORDER: McpStatus[] = ['failed', 'needs-auth', 'pending', 'connected', 'disabled'];

/**
 * MCP サーバーの状態。数が多くなるので、状態ごとの件数をボタンで出し、
 * 押した状態のサーバーだけを名前のチップで詰めて出す（もう一度押すと閉じる）。
 * 失敗の理由は、チップにマウスを乗せると出る
 */
export function McpServers({
  servers,
  strings,
  initialStatus,
}: {
  servers: McpServerInfo[];
  strings: PanelStrings;
  /** 最初に開いておく状態 */
  initialStatus?: McpStatus;
}) {
  const [open, setOpen] = useState<McpStatus | undefined>(initialStatus);
  const groups = MCP_ORDER.map((status) => ({
    status,
    servers: servers.filter((server) => server.status === status),
  })).filter((group) => group.servers.length > 0);
  const shown = groups.find((group) => group.status === open);
  return (
    <>
      <div class="mcp-counts">
        {groups.map((group) => (
          <button
            class="mcp-count"
            data-status={group.status}
            aria-pressed={group.status === open ? 'true' : 'false'}
            key={group.status}
            onClick={() => setOpen(group.status === open ? undefined : group.status)}
          >
            {`${strings.mcpStatus[group.status]} ${group.servers.length}`}
          </button>
        ))}
      </div>
      {shown !== undefined && (
        <Scroll class="mcp-chips-scroll" viewportClass="mcp-chips">
          {shown.servers.map((server) => (
            <span class="mcp-chip" title={server.error ?? server.scope} key={server.name}>
              {server.name}
            </span>
          ))}
        </Scroll>
      )}
    </>
  );
}
