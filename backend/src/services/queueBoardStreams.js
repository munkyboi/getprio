// Process-local bounds cap recurring work as well as handshake traffic.
function createStreamBudget({ perIp = 10, perBoard = 20, total = 100 } = {}) {
  const ips = new Map();
  const boards = new Map();
  let count = 0;
  function acquire(ip, boardId) {
    if (count >= total || (ips.get(ip) || 0) >= perIp || (boards.get(boardId) || 0) >= perBoard) return null;
    count++; ips.set(ip, (ips.get(ip) || 0) + 1); boards.set(boardId, (boards.get(boardId) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true; count--;
      for (const [map, key] of [[ips, ip], [boards, boardId]]) {
        const remaining = map.get(key) - 1;
        if (remaining) map.set(key, remaining); else map.delete(key);
      }
    };
  }
  return { acquire };
}
module.exports = { createStreamBudget };
