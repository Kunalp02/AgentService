
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cfg, CONFIG_API, ENGINE_API, msg, setActiveKb } from './apiClient';
import { configKnowledgeBases } from './configBridge';
import { KbSummary } from './ragTypes';


interface RagContextType {
  kbs: KbSummary[];
  activeKb: string;
  active: KbSummary | undefined;
  pickKb: (name: string) => void;
  refreshKbs: () => Promise<KbSummary[]>;
  /** Bumped whenever something was ingested, so Documents reloads. */
  tick: number;
  bump: () => void;
  toast: string;
  flash: (m: string) => void;
  /** The PYTHON engine only. Empty string means it answered. */
  engineError: string;
  engineReady: boolean;
  /** The .NET configuration service. If this is set, nothing works. */
  configError: string;
  loading: boolean;
}

const RagContext = createContext<RagContextType | undefined>(undefined);

const REMEMBERED = 'rag.kb';

export const RagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [kbs, setKbs] = useState<KbSummary[]>([]);
  const [activeKb, setActive] = useState('');
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState('');
  const [engineError, setEngineError] = useState('');
  const [configError, setConfigError] = useState('');
  const [loading, setLoading] = useState(true);


  const timer = useRef<number | undefined>(undefined);

  const flash = useCallback((m: string) => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    setToast(m);
    timer.current = window.setTimeout(() => {
      setToast('');
      timer.current = undefined;
    }, 3800);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const pickKb = useCallback((name: string) => {
    setActive(name);
    setActiveKb(name);
    try {
      localStorage.setItem(REMEMBERED, name);
    } catch {
      /* private mode — the selection just does not survive a reload */
    }
    setTick((t) => t + 1);
  }, []);

  const refreshKbs = useCallback(async (): Promise<KbSummary[]> => {
    const list = await configKnowledgeBases();
    setKbs(list || []);
    return list || [];
  }, []);

  useEffect(() => {
    (async () => {
      /* Is the engine up? Asked of the configuration service, which pings it
         on /health. Asking the engine directly is what this used to do, and a
         dead port answers nothing at all — so the only thing that could be
         reported was the failure of the question itself. */
      try {
        const health: any = await cfg('GET', '/health');
        const engine = health?.engine || {};
        setEngineError(
          engine.reachable
            ? ''
            : `The knowledge base engine at ${engine.url || ENGINE_API} is not answering` +
              `${engine.problem ? ' — ' + engine.problem : ''}. Start it, then reload.`,
        );
      } catch {
        // The configuration service itself did not answer. That is reported
        // below; guessing about the engine from here would be a second
        // sentence about a service we could not reach either.
        setEngineError('');
      }

      try {
        const list = await refreshKbs();
        let remembered = '';
        try {
          remembered = localStorage.getItem(REMEMBERED) || '';
        } catch {
          remembered = '';
        }
        const pick =
          remembered && list.some((k) => k.name === remembered)
            ? remembered
            : list[0] && list[0].name;
        setActive(pick || '');
        setActiveKb(pick || '');
        setConfigError('');
      } catch (e) {
        setKbs([]);
        setConfigError(
          `Cannot reach the configuration service at ${CONFIG_API} — start it, then reload. (${msg(e)})`,
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKbs]);

  const active = kbs.find((k) => k.name === activeKb);

  
  const value = useMemo(
    () => ({
      kbs,
      activeKb,
      active,
      pickKb,
      refreshKbs,
      tick,
      bump,
      toast,
      flash,
      engineError,
      engineReady: !engineError,
      configError,
      loading,
    }),
    [kbs, activeKb, active, pickKb, refreshKbs, tick, bump, toast, flash,
     engineError, configError, loading],
  );

  return <RagContext.Provider value={value}>{children}</RagContext.Provider>;
};

export const useRag = () => {
  const ctx = useContext(RagContext);
  if (!ctx) throw new Error('useRag must be used within a RagProvider');
  return ctx;
};
