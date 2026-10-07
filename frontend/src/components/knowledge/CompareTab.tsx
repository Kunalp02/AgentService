
import React, { useState } from 'react';
import { msg, post } from '../../rag/apiClient';
import { useRag } from '../../rag/RagContext';
import { BTN_PRI, Card, HELP, Pill, Step, TEXTAREA } from '../../rag/RagUI';

/* COMPARE SETTINGS. The strategy form offers nine retrieval methods, five
   rerankers and four guardrails with a hint and a star each - the author's
   opinion, the same for every base. This runs the reader's own questions
   through every retrieval x reranker and every guardrail on THIS base and
   shows what each one got right (kb/eval/compare.py). Nothing is changed:
   the recommendation is a sentence, and the strategy is where it is acted on. */

const EXAMPLE = [
  'When did NPCI introduce the RuPay card? || March 2012',
  'Within how many months of IIN assignment must issuing start? || 9 months',
  'Who is the CEO of NPCI? || -',
].join('\n');

type Row = {
  mode: string;
  rerank: string;
  label: string;
  hit1: number;
  hitk: number;
  scored: number;
  median_ms: number;
  misses: string[];
  current: boolean;
};

function parse(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('||');
      return at < 0
        ? { q: line, expect: '' }
        : { q: line.slice(0, at).trim(), expect: line.slice(at + 2).trim() };
    })
    .filter((x) => x.q);
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export const CompareTab: React.FC = () => {
  const { flash } = useRag();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  const questions = parse(text);
  const toRefuse = questions.filter((x) => !x.expect || x.expect === '-').length;

  async function run() {
    if (!questions.length) return;
    setBusy(true);
    setRes(null);
    try {
      setRes(await post('/compare', { questions }));
    } catch (e) {
      flash(msg(e));
    }
    setBusy(false);
  }

  const rows: Row[] = (res && res.retrieval) || [];
  const best = rows.length ? Math.max(...rows.map((r) => r.hit1)) : 0;
  const rec = res && res.recommendation;
  const labelOf = (mode: string, rerank: string) =>
    (rows.find((r) => r.mode === mode && r.rerank === rerank) || ({} as Row)).label ||
    `${mode} + ${rerank}`;

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <Card>
        <Step
          n="1"
          title="Your questions, and the words the right answer contains"
          help={
            <>
              One per line: <span className="font-mono">question || expected words</span>. Use{' '}
              <span className="font-mono">a | b</span> when either counts, and{' '}
              <span className="font-mono">-</span> for a question the documents do not answer - it
              must be refused. Up to 25.
            </>
          }
        >
          <textarea
            className={`${TEXTAREA} mt-3 font-mono`}
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            data-testid="compare-questions"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              className={BTN_PRI}
              disabled={busy || !questions.length || questions.length > 25}
              onClick={run}
              data-testid="compare-run"
            >
              {busy ? 'Measuring…' : 'Compare every setting'}
            </button>
            <span className={HELP}>
              {questions.length
                ? `${questions.length} question${questions.length === 1 ? '' : 's'} · ${toRefuse} to be refused · each run 24 times, about ${Math.max(5, Math.round(questions.length * 1.3))} s`
                : 'Nothing is changed - this only measures.'}
            </span>
          </div>
        </Step>
      </Card>

      {res && (
        <>
          <Card>
            <Step
              n="2"
              title="What to use"
              help={`Measured on ${res.questions.length} questions in ${res.seconds} s, top-${res.k}.`}
            >
              <div
                className="grid grid-cols-2 gap-3 mt-3 text-xs [&>*]:min-w-0"
                data-testid="compare-recommendation"
              >
                {rec && rec.retrieval && (
                  <div
                    className={`p-3.5 rounded-xl border ${
                      rec.retrieval.change ? 'border-amber-500/40' : 'border-emerald-500/40'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      Retrieval + reranking
                    </span>
                    <div className="text-sm font-bold text-white mt-1">
                      {labelOf(rec.retrieval.mode, rec.retrieval.rerank)}{' '}
                      <Pill tone={rec.retrieval.change ? 'warn' : 'good'}>
                        {rec.retrieval.change ? 'change' : 'keep'}
                      </Pill>
                    </div>
                    <p className={`${HELP} mt-1`}>{rec.retrieval.why}</p>
                  </div>
                )}
                {rec && rec.guardrail && (
                  <div
                    className={`p-3.5 rounded-xl border ${
                      rec.guardrail.change ? 'border-amber-500/40' : 'border-emerald-500/40'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      Guardrail
                    </span>
                    <div className="text-sm font-bold text-white mt-1">
                      {rec.guardrail.guardrail}{' '}
                      <Pill tone={rec.guardrail.change ? 'warn' : 'good'}>
                        {rec.guardrail.change ? 'change' : 'keep'}
                      </Pill>
                    </div>
                    <p className={`${HELP} mt-1`}>{rec.guardrail.why}</p>
                  </div>
                )}
              </div>
              <p className={`${HELP} mt-3`}>
                Within one question of the best, the current setting is kept - on a couple of dozen
                questions a difference of one is noise. Change the strategy (Strategies tab) to act
                on this.
              </p>
            </Step>
          </Card>

          <Card>
            <Step
              n="3"
              title="Retrieval x reranking"
              help="First place: the right passage came first. In top-k: it was among the passages the answer is built from."
            >
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs" data-testid="compare-retrieval">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      <th className="py-2 pr-3">Setting</th>
                      <th className="py-2 pr-3">First place</th>
                      <th className="py-2 pr-3">In top-{res.k}</th>
                      <th className="py-2 pr-3">Median</th>
                      <th className="py-2">Missed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.mode + r.rerank}
                        className={`border-t border-slate-800 ${r.current ? 'bg-emerald-500/5' : ''}`}
                      >
                        <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">
                          {r.label} {r.current && <Pill tone="good">now</Pill>}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full ${
                                  r.hit1 === best ? 'bg-emerald-500' : 'bg-slate-500'
                                }`}
                                style={{ width: `${pct(r.hit1, r.scored)}%` }}
                              />
                            </div>
                            <span
                              className={`font-mono ${
                                r.hit1 === best ? 'text-emerald-300' : 'text-slate-300'
                              }`}
                            >
                              {r.hit1}/{r.scored}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-300">
                          {r.hitk}/{r.scored}
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-400">
                          {Math.round(r.median_ms)} ms
                        </td>
                        <td className="py-2 text-slate-500 break-words [overflow-wrap:anywhere]">
                          {r.misses.length ? r.misses.join(' · ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Step>
          </Card>

          <Card>
            <Step
              n="4"
              title="Guardrail"
              help="The base's own strategy with only the guardrail changed, asked end to end. A wrong answer counts three times a refusal."
            >
              <table className="w-full text-xs mt-3" data-testid="compare-guardrail">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    <th className="py-2 pr-3">Guardrail</th>
                    <th className="py-2 pr-3">Answered correctly</th>
                    <th className="py-2 pr-3">Answered wrongly</th>
                    <th className="py-2">Refused what it should</th>
                  </tr>
                </thead>
                <tbody>
                  {res.guardrail.map((g: any) => (
                    <tr
                      key={g.guardrail}
                      className={`border-t border-slate-800 ${g.current ? 'bg-emerald-500/5' : ''}`}
                    >
                      <td className="py-2 pr-3 text-slate-200">
                        {g.guardrail} {g.current && <Pill tone="good">now</Pill>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-300">
                        {g.correct}/{g.answerable}
                      </td>
                      <td
                        className={`py-2 pr-3 font-mono ${
                          g.answered_wrong ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      >
                        {g.answered_wrong}
                      </td>
                      <td
                        className={`py-2 font-mono ${
                          g.answered_unanswerable ? 'text-red-300' : 'text-slate-300'
                        }`}
                      >
                        {g.unanswerable ? `${g.refused_ok}/${g.unanswerable}` : '— none asked'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Step>
          </Card>

          <Card>
            <Step n="5" title="Each question, with the current settings">
              <div className="mt-3 space-y-2">
                {res.questions.map((x: any) => (
                  <div key={x.q} className="p-3 rounded-lg border border-slate-800 text-xs">
                    <div className="flex items-start gap-2">
                      <Pill tone={x.ok ? 'good' : 'warn'}>
                        {x.ok ? 'right' : x.must_refuse ? 'answered' : 'missed'}
                      </Pill>
                      <span className="text-slate-200 flex-1">{x.q}</span>
                      <span className="text-slate-500 font-mono whitespace-nowrap">
                        {x.must_refuse
                          ? 'must refuse'
                          : x.rank_now
                            ? `passage #${x.rank_now}`
                            : 'passage not found'}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-1.5 break-words [overflow-wrap:anywhere]">
                      {x.answer ? x.answer : <span className="italic">refused</span>}
                      {!x.must_refuse && (
                        <span className="text-slate-600"> · expected “{x.expect}”</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </Step>
          </Card>
        </>
      )}
    </div>
  );
};
