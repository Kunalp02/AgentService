
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { msg, post } from '../../rag/apiClient';
import { EvidenceItem } from '../../rag/ragTypes';
import { useRag } from '../../rag/RagContext';
import { Bar, BTN_PRI, Card, HELP, INPUT, KV, Meter, Pill, Step } from '../../rag/RagUI';
import { FigureThumb } from './FigureThumb';

/* ------------------------------------------------------------------
   The bank asked for the reasoning, not just the result. So this screen
   is the engine's own order of work, one numbered step per stage: what
   it understood, what it found, what it decided. Nothing here is a
   summary written after the fact — every number is the one the run
   actually produced.
------------------------------------------------------------------- */

/** Why this atom's status is what it is, and against WHICH other atom.
 *
 * "SUPERSEDED" on its own is a word, not a fact - superseded by what, saying
 * what instead, out of which file? The engine sends the other claim now
 * (KnowledgeBase._relations), so the reader can check whether the label is
 * even right without going into the database. Corroboration is here for the
 * same reason: trust 1.0 means "three sources agreed", and that is the number
 * the score is computed from.
 */
const StatusWhy: React.FC<{ c: any }> = ({ c }) => {
  const rel = c.relations || [];
  const corr = c.corroboration || 1;
  /* WHERE, AND WHAT CHANGED. `pages` is where docling says the passage was
     printed. A passage is a whole section, so a later circular changing ONE
     statement in it no longer marks the whole section disputed: the engine
     names the statement, what replaced it and where - and that is shown here,
     under the passage it belongs to. */
  const pages: number[] = c.pages || [];
  const sup: any[] = c.superseded_facts || [];
  const dis: any[] = c.disputed_facts || [];
  const WORDS: Record<string, string> = {
    supersedes: 'replaces',
    superseded_by: 'replaced by',
    disputes: 'clashes with',
  };
  if (!rel.length && corr <= 1 && !pages.length && !sup.length && !dis.length) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {pages.length > 0 && (
        <div className="text-[10px] text-slate-400">
          printed on{' '}
          <b className="text-slate-300">
            {pages.length > 1 ? `pages ${pages[0]}–${pages[pages.length - 1]}` : `page ${pages[0]}`}
          </b>
        </div>
      )}
      {sup.map((f: any, n: number) => (
        <div key={`s${n}`} className="text-[10px] text-slate-400 border-l-2 border-rose-500/60 pl-2">
          <span className="uppercase tracking-wide text-rose-300/90">no longer in force</span>{' '}
          “{f.fact}” — <span className="font-mono text-slate-500">{f.source}</span> now says “{f.now}”
        </div>
      ))}
      {dis.map((f: any, n: number) => (
        <div key={`d${n}`} className="text-[10px] text-slate-400 border-l-2 border-amber-500/50 pl-2">
          <span className="uppercase tracking-wide text-amber-300/90">stated differently</span>{' '}
          “{f.fact}” — <span className="font-mono text-slate-500">{f.source}</span> says “{f.with}”
        </div>
      ))}
      {corr > 1 && (
        <div className="text-[10px] text-slate-400">
          <b className="text-slate-300">{corr} sources</b> stated this — trust{' '}
          {typeof c.trust === 'number' ? c.trust.toFixed(2) : '—'} = 0.7 + 0.1 × {corr}
        </div>
      )}
      {rel.map((r: any, n: number) => (
        <div
          key={n}
          className="text-[10px] text-slate-400 border-l-2 border-amber-500/50 pl-2"
        >
          <span className="uppercase tracking-wide text-amber-300/90">
            {WORDS[r.kind] || r.kind}
          </span>{' '}
          {r.missing ? (
            <i>an atom that is no longer in this base ({r.id})</i>
          ) : (
            <>
              “{r.claim}”{' '}
              <span className="font-mono text-slate-500">
                {r.source}
                {typeof r.trust === 'number' ? ` · trust ${r.trust}` : ''}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

/* THE RERANK SCORE IN ITS PARTS (adaptive reranker): what the question's
   words matched, how trusted and how fresh the passage is, any status
   penalty, and the share of retrieval's own confidence carried over - plus
   where retrieval had ranked it. The parts add up to the score above. */
const ScoreParts: React.FC<{ c: any }> = ({ c }) => {
  const p = c.score_parts;
  const moved =
    typeof c.retrieval_rank === 'number' ? (
      <div className="text-[10px] text-slate-500 font-mono mt-1">retrieved #{c.retrieval_rank}</div>
    ) : null;
  if (!p) return moved;
  const w = p.weights || {};
  const row = (label: string, v: number, wt: number, title?: string) => (
    <div className="flex justify-between gap-2" title={title}>
      <span>{label}</span>
      <span>
        {v.toFixed(2)} × {wt.toFixed(2)}
      </span>
    </div>
  );
  return (
    <div className="mt-1.5 text-[10px] font-mono text-slate-500 leading-4 min-w-[9rem]">
      {row('overlap', p.overlap, w.overlap ?? 0.55, `words matched, via the ${p.overlap_via}`)}
      {row('trust', p.trust, w.trust ?? 0.3)}
      {row('freshness', p.freshness, w.freshness ?? 0.15)}
      {p.prior > 0 && row('retrieval', p.prior, w.prior ?? 0.25, "retrieval's own fused score")}
      {p.penalty > 0 && (
        <div className="flex justify-between gap-2 text-red-300">
          <span>status</span>
          <span>−{p.penalty.toFixed(2)}</span>
        </div>
      )}
      {moved}
    </div>
  );
};

export const TraceTab: React.FC = () => {
  const { flash } = useRag();

  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [ev, setEv] = useState<EvidenceItem[]>([]);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [openClaims, setOpenClaims] = useState<Record<number, boolean>>({});
  const [cut, setCut] = useState<any>(null); // how many /retrieve kept, and why
  // WHICH MODEL EMBEDDED THIS QUERY, AND WAS IT THERE. A base embedded with
  // nomic whose Ollama is down still answers (keyword half only) - the
  // reader must see that on the trace itself, not only on the store bar.
  const [used, setUsed] = useState<any>(null);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    setRes(null);
    setEv([]);
    setCut(null);
    setUsed(null);
    try {
      // /ask?trace carries the stages; /retrieve carries what a trace
      // cannot — whether the corpus contradicts its own evidence.
      const [answer, evidence] = await Promise.all([
        post('/ask', { question: q, trace: true, use_pipeline: true }),
        // No k, no mode: the bound strategy decides both, the same way it
        // does for /ask above - so the passages shown are the ones the
        // answer was built from, not eight hybrid ones beside a keyword answer.
        post('/retrieve', { query: q }).catch(() => null),
      ]);
      setRes(answer);
      setEv((evidence && evidence.evidence) || []);
      setCut(evidence && evidence.k);
      setUsed(evidence && evidence.embedding_used);
    } catch (e) {
      flash(msg(e));
    }
    setBusy(false);
  }

  const t = res && res.trace;
  const qu = t && t.query_understanding;
  const clashSources: Record<string, any[]> = {};
  ev.forEach((e) => {
    if (e.contradicted_by && e.contradicted_by.length)
      clashSources[(e.claim || '').slice(0, 60)] = e.contradicted_by;
  });
  const answered = res && t && t.decision === 'answer';

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <Card>
        <div className="flex gap-3">
          <input
            className={INPUT}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="reimbursement period for loans"
            onKeyDown={(e) => {
              if (e.key === 'Enter') run();
            }}
          />
          <button className={`${BTN_PRI} shrink-0`} disabled={busy} onClick={run}>
            {busy ? 'Tracing…' : 'Trace'}
          </button>
        </div>
        {busy && <Bar width="55%" />}
      </Card>

      {/* TWO COLUMNS ONCE THERE IS AN ANSWER.

          The four stages used to stack, so reading why an answer came out
          meant scrolling through the query, the candidates, the decision and
          the evidence in one column about three screens tall - and the two a
          reader compares MOST, the decision and the passages it was made
          from, were the two furthest apart.

          Left is what the engine DID (understanding, then the candidates it
          ranked); right is what it CONCLUDED (the verdict, then the evidence
          behind it). They sit level, so an answer is read beside its
          evidence. One column below `xl`, where side-by-side would be two
          narrow ones. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
      <div className="space-y-5">

      {qu && (
        <Card>
          <Step
            n={1}
            title="Query understanding"
            tone="indigo"
            help={<Pill tone="info">no LLM</Pill>}
          >
            <KV k="Original">
              <span className="font-mono">{qu.original}</span>
            </KV>
            <KV k="Terms">
              {(qu.terms || []).map((w: string, i: number) => (
                <span
                  key={i}
                  className="inline-block ml-1.5 my-0.5 px-2 py-0.5 rounded bg-slate-800 font-mono text-[11px] text-slate-300"
                >
                  {w}
                </span>
              ))}
            </KV>
            {(qu.added || []).length > 0 && (
              <KV k="Expanded with">
                {qu.added.map((w: string, i: number) => (
                  <span
                    key={i}
                    className="inline-block ml-1.5 my-0.5 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 font-mono text-[11px] text-emerald-300 font-semibold"
                  >
                    {w}
                  </span>
                ))}
              </KV>
            )}
            {qu.how && <p className={`${HELP} mt-3`}>{qu.how}</p>}
            {(qu.added || []).length > 0 && (
              <p className={`${HELP} mt-1.5`}>
                These extra words were learned from your own documents. Nothing was invented — a
                word your corpus never uses can never be added.
              </p>
            )}
          </Step>
        </Card>
      )}

      {t && (
        <Card>
          <Step
            n={2}
                  title="Candidates after reranking"
            tone="indigo"
            help={
              typeof t.kept === 'number'
                ? `${t.retrieved} retrieved (pool of ${t.pool ?? '?'}) · ${t.kept} kept as evidence (top_k ${t.top_k ?? '?'}) · ${Math.max(0, (t.candidates || []).length - t.kept)} scored and dropped`
                : `${t.retrieved} retrieved, ${(t.candidates || []).length} shown`
            }
          >
            {used && (
              <div
                data-testid="embedding-used"
                className={`mb-3 px-3 py-2 rounded-lg border text-[11px] font-mono ${
                  used.available
                    ? 'border-slate-800 bg-slate-900/60 text-slate-400'
                    : 'border-red-500/40 bg-red-500/10 text-red-300'
                }`}
              >
                {used.available ? (
                  <>
                    Embedded with <span className="text-slate-200">{used.model || used.ref}</span>
                    {used.gateway ? ` via ${used.gateway}` : ''} · {used.signature} ·{' '}
                    <span className="text-emerald-300">available</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Embedding model unavailable</span> —{' '}
                    {used.model || used.ref}
                    {used.gateway ? ` via ${used.gateway}` : ''}. These candidates came from the
                    keyword side only.{used.problem ? ` ${used.problem}` : ''}
                  </>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
             
             
                            <thead className="text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-2 font-semibold w-8">#</th>
                    {/* THE SCORE FIRST. It sat right of a wide claim column,
                        and on a narrower screen the table scrolled sideways
                        and cut the number off - leaving only the bar. */}
                    <th className="py-2 px-2 font-semibold w-44">Rerank score</th>
                    <th className="py-2 px-2 font-semibold">Claim</th>
                    {/* KEPT is the reranker's verdict; STATUS is the atom's own
                        (a disputed atom can still be evidence). They were one
                        column, and "DISPUTED" read as "rejected". */}
                    <th className="py-2 px-2 font-semibold w-24">Kept</th>
                    <th className="py-2 px-2 font-semibold w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(t.candidates || [])
                    .slice(0, showAllCandidates ? undefined : Math.max(8, t.kept || 0))
                    .map((c: any, i: number) => {
                    const disputed = (c.status || '').toUpperCase() !== 'ACTIVE';
                    const top = (t.candidates[0] || {}).rerank_score || 1;
                    const known = typeof c.kept === 'boolean';
                    return (
                      <tr key={i} className={known && !c.kept ? 'opacity-60' : ''}>
                        <td className="py-2.5 px-2 font-mono text-slate-500 align-top">{i + 1}</td>
                        <td className="py-2.5 px-2 align-top" data-testid="rerank-score">
                          <div className="font-mono text-sm font-semibold text-slate-100">
                            {(c.rerank_score || 0).toFixed(4)}
                          </div>
                          <Meter value={(c.rerank_score || 0) / (top || 1)} />
                          <ScoreParts c={c} />
                        </td>
                        {/* THE WHOLE PASSAGE. The engine used to send the
                            first 80 characters and this cell printed them,
                            so the one screen whose job is "show me what the
                            answer was built from" showed a preview. Long
                            passages collapse to six lines with a toggle -
                            collapsed, not cut: the text is all here. */}
                        <td className="py-2.5 px-2 align-top">
                          <div
                            className={`whitespace-pre-wrap break-words ${
                              openClaims[i] ? '' : 'line-clamp-6'
                            }`}
                          >
                            {c.claim}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            {(c.chars || 0) > 420 && (
                              <button
                                className="text-[10px] text-indigo-300 hover:text-indigo-200"
                                onClick={() =>
                                  setOpenClaims({ ...openClaims, [i]: !openClaims[i] })
                                }
                              >
                                {openClaims[i] ? 'show less' : `show all ${c.chars} characters`}
                              </button>
                            )}
                            {c.source && (
                              <span className="font-mono text-[10px] text-slate-500">
                                {c.source}
                              </span>
                            )}
                          </div>
                          <StatusWhy c={c} />
                        </td>
                        <td className="py-2.5 px-2">
                          {!known ? (
                            <span className="text-slate-600">—</span>
                          ) : c.kept ? (
                            <Pill tone="good">[{c.evidence_n}]</Pill>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500">dropped</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <Pill tone={disputed ? 'crit' : 'good'}>
                            {disputed ? c.status || 'DISPUTED' : 'ACTIVE'}
                          </Pill>
                        </td>
                      </tr>
                    );
                  })}
                  {(t.candidates || []).length > Math.max(8, t.kept || 0) && (
                    <tr>
                      <td colSpan={5} className="py-2 px-2">
                        <button
                          className="text-[11px] text-indigo-300 hover:text-indigo-200"
                          onClick={() => setShowAllCandidates(!showAllCandidates)}
                        >
                          {showAllCandidates
                            ? 'show fewer'
                            : `show all ${(t.candidates || []).length} scored candidates`}
                        </button>
                      </td>
                    </tr>
                  )}
                  {!(t.candidates || []).length && (
                    <tr>
                      <td colSpan={5} className={`${HELP} py-5`}>
                        Nothing was retrieved for this question.
                      </td>
                    </tr>
                  )}
                </tbody>


              </table>
            </div>
          </Step>
        </Card>
      )}

      </div>
      <div className="space-y-5">

      {res && (
        <Card>
          <Step n={3} title="Guardrail decision" tone="indigo">
            <KV k="Confidence">
              <Meter value={res.confidence || 0} />
              <span className="font-mono text-[11px]">{(res.confidence || 0).toFixed(3)}</span>
            </KV>
            <KV k="Groundedness">
              <Meter value={res.groundedness || 0} />
              <span className="font-mono text-[11px]">{(res.groundedness || 0).toFixed(3)}</span>
            </KV>
            <KV k="Guardrail level">
              <span className="font-mono">{res.guardrail || '—'}</span>
            </KV>
            <KV k="Decision">
              <Pill tone={answered ? 'good' : 'warn'}>{(t && t.decision) || '—'}</Pill>
            </KV>
            <KV k={answered ? 'Answer' : 'Instead of answering'}>
              {/* `clarify` is what the engine actually sends
                  (kb/service.py sets result["clarify"]). This read
                  `clarifying_question`, which nothing has ever produced, so
                  every refusal fell through to the generic sentence below and
                  the clarifying question - the useful half of a refusal, and
                  the reason the guardrail asks one at all - was never shown to
                  anybody. The old name is kept as a fallback and costs
                  nothing. */}
              {answered
                ? res.answer
                : res.clarify ||
                  res.clarifying_question ||
                  res.answer ||
                            'The evidence did not clear the bar, so nothing was asserted.'}
            </KV>
            {/* HOW THE ANSWER WAS MADE. `extracted` is a quote - the cell,
                sentence or list line that answers, cut from the evidence with
                no model (kb/core/answer_extract.py); `generated` is a model's
                answer that passed the check that every number in it is in the
                evidence; `passage` is the whole top passage, when nothing
                narrower answered on its own. */}
            {answered && res.answer_mode && (
              <KV k="How it was answered">
                <Pill tone={res.answer_mode === 'passage' ? 'warn' : 'good'}>
                  {res.answer_mode === 'extracted'
                    ? 'quoted from the evidence · no model'
                    : res.answer_mode === 'generated'
                      ? 'generated · every number checked against the evidence'
                      : 'whole passage'}
                </Pill>
              </KV>
            )}
            {res.answer_check && res.answer_check.passed === false && (
              <p className="text-xs text-amber-300 leading-relaxed mt-2">
                The model's answer used {(res.answer_check.unsupported_numbers || []).join(', ')},
                which none of the evidence contains, so it was not shown. What is shown is the
                quote the model was given.
              </p>
            )}
            {answered && res.answer_mode === 'extracted' && res.answer_passage && (
              <details className="mt-2">
                <summary className={`${HELP} cursor-pointer`}>
                  The whole passage it was quoted from
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-300 bg-slate-900/60 rounded-lg p-3 max-h-64 overflow-auto">
                  {res.answer_passage}
                </pre>
              </details>
            )}
            {!answered && (
              <p className={`${HELP} mt-3`}>
                This is the guardrail doing its job. A confident wrong answer costs a bank more
                than no answer.
              </p>
            )}
            {typeof res.latency_ms === 'number' && (
              <p className={`${HELP} mt-2 font-mono`}>
                Whole run: {res.latency_ms} ms{res.cached ? ' · served from cache' : ''}.
              </p>
            )}
          </Step>
        </Card>
      )}

      {Object.keys(clashSources).length > 0 && (
        <Card className="border-amber-500/40">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-amber-200">
              Your documents disagree with each other
            </h3>
          </div>
          <p className={`${HELP} mt-1.5`}>
            Read step 3 with this in mind. The answer was built from one side of a disagreement
            that exists in your own files.
          </p>
          {Object.entries(clashSources).map(([claim, list], i) => (
            <div key={i} className="mt-3 pl-3 border-l-2 border-amber-500/60">
              <div className="text-xs text-slate-200">{claim}…</div>
              {list.map((c: any, j: number) => (
                <div key={j} className="mt-1.5">
                  <div className="text-xs text-slate-300">…but this says: {c.claim}</div>
                  <div className="font-mono text-[10px] text-slate-500">{c.source}</div>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}

      {ev.length > 0 && (
        <Card>
          <Step
            n={4}
            title="Where the evidence came from"
            help={cut ? `${cut.returned} of ${cut.considered} kept` : undefined}
          >
            {/* Step 2 lists every candidate the reranker scored; this step
                lists only the ones the evidence cut kept, so the two counts
                differ on purpose. Left unexplained that reads as the screen
                contradicting itself. */}
            {cut && (
              <p className={`${HELP} mb-3`}>
                Step 2 shows every candidate that was scored. This step shows only the ones kept as
                evidence — <b className="text-white">{cut.returned}</b>, because {cut.why}. The
                number of passages is decided by the scores, not by a setting.
              </p>
            )}
            {ev.map((e, i) => (
              <div
                key={i}
                className={`my-2.5 pl-3 border-l-2 ${
                  e.contradicted_by.length ? 'border-amber-500/60' : 'border-slate-700'
                }`}
              >
                <div className="text-xs text-slate-200">{e.claim}</div>
                {/* A figure's explanation shows the figure - see FigureThumb. */}
                              <FigureThumb claim={e.claim} source={e.source} />
                <StatusWhy c={e} />
                <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                  {e.source} · found by {e.found_by.join(' + ')} · trust {e.trust}
                  {e.contradicted_by.length > 0 && (
                    <span className="ml-2">
                      <Pill tone="warn">disputed</Pill>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </Step>
        </Card>
      )}

      </div>
      </div>
    </div>
  );
};
