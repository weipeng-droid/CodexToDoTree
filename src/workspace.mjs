const rank = { in_progress:0, blocked:1, awaiting_verification:2, todo:3, done:4, skipped:5 };
export function compareBoards(a,b) {
  return (rank[a.status] ?? 9)-(rank[b.status] ?? 9) || b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key);
}
export function workspaceSnapshot(boards, metadata, threadId, warning = null) {
  const visible=boards.filter(b=>!metadata.get(b.threadId)?.archived).sort(compareBoards);
  const threads=new Map();
  for(const board of visible) {
    const meta=metadata.get(board.threadId);
    if(!threads.has(board.threadId)) threads.set(board.threadId,{
      id:board.threadId,title:meta?.title || board.threadTitle,boardCount:0,updated:board.updatedAt,status:board.status,
      project:meta?.project || {id:`custom:${board.project}`,label:board.project,order:9999},
    });
    const thread=threads.get(board.threadId); thread.boardCount++;
    if(board.updatedAt>thread.updated) thread.updated=board.updatedAt;
    if((rank[board.status]??9)<(rank[thread.status]??9)) thread.status=board.status;
  }
  const summaries=[...threads.values()].sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||b.updated.localeCompare(a.updated));
  const projects=new Map();
  for(const thread of summaries) {
    if(!projects.has(thread.project.id)) projects.set(thread.project.id,{...thread.project,threads:[]});
    projects.get(thread.project.id).threads.push(thread);
  }
  const groups=[...projects.values()].sort((a,b)=>a.order-b.order||a.label.localeCompare(b.label,'zh-CN'));
  const meta=metadata.get(threadId);
  return {schema:1,threads:summaries,projects:groups,boards:threadId?visible.filter(b=>b.threadId===threadId):visible,
    selection:threadId?{id:threadId,title:meta?.title || threads.get(threadId)?.title || null,archived:!!meta?.archived}:null,
    metadataWarning:warning};
}
