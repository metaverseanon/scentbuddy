import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Drop,
  Users,
  ChartBar,
  Sparkle,
  ArrowRight,
  Scan,
  Check,
  Crown,
  Star,
  WarningCircle,
  CaretLeft,
  MapPin,
  TrendUp,
  ArrowDown,
} from 'phosphor-react-native';
import {
  QUIZ_FLOW,
  QUESTION_BY_KEY,
  QUIZ_QUESTION_COUNT,
  QuizQuestionType,
  QuizResults,
} from '@/constants/quiz';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const BG = '#0a0806';
const GOLD = '#c49a6c';
const GOLD_LIGHT = '#e3c39a';
const TEXT = '#f6f1e9';
const SUBTEXT = 'rgba(246,241,233,0.55)';
const FAINT = 'rgba(246,241,233,0.38)';
const CARD = 'rgba(255,255,255,0.05)';
const CARD_BORDER = 'rgba(255,255,255,0.09)';

interface SolutionRow {
  icon: React.ElementType;
  title: string;
  desc: string;
}

// Map the user's stated frustrations + goals to the concrete features that
// close each one. Keeps the "how the app closes your gap" screen personal
// rather than a generic feature tour.
function buildSolutions(struggles: string[], goals: string[]): SolutionRow[] {
  const rows: SolutionRow[] = [];
  const add = (r: SolutionRow) => {
    if (rows.length < 4 && !rows.some((x) => x.title === r.title)) rows.push(r);
  };
  const s = (v: string) => struggles.includes(v);
  const g = (v: string) => goals.includes(v);

  if (s('I blind-buy and regret it') || g('Stop wasting money on bad buys'))
    add({ icon: Scan, title: 'AI scent matching', desc: "Get matched to bottles you'll love before you spend a cent." });
  if (s("I can't find my signature") || g('Find my signature scent'))
    add({ icon: Drop, title: 'Scent DNA', desc: "Pinpoint the profile that's unmistakably you." });
  if (s('I forget what I own') || g('Track & remember what I own'))
    add({ icon: ChartBar, title: 'Collection tracker', desc: 'Every bottle, note and memory in one place.' });
  if (s('Too many options, I feel lost'))
    add({ icon: Sparkle, title: 'Curated For You', desc: 'A personal shortlist instead of endless choices.' });
  if (s('I wear the same one on repeat') || g('Build a smart, curated collection'))
    add({ icon: ChartBar, title: 'Scent wardrobe', desc: 'Build a rotation for every season and moment.' });
  if (s("I don't know what suits me"))
    add({ icon: Users, title: 'Twin Finder', desc: 'See what people with your exact taste wear.' });
  if (g('Get more compliments'))
    add({ icon: Star, title: 'Compliment-getters', desc: 'Surface crowd-pleasers proven to turn heads.' });
  if (g('Discover niche hidden gems'))
    add({ icon: Crown, title: 'Hidden gems', desc: "Go beyond mainstream into niche you'd never find." });

  if (rows.length === 0) {
    add({ icon: Drop, title: 'Scent DNA', desc: 'Understand your taste in one clear profile.' });
    add({ icon: Scan, title: 'AI scent matching', desc: 'Personalized picks that actually fit you.' });
    add({ icon: ChartBar, title: 'Collection tracker', desc: 'Keep your whole wardrobe organized.' });
  }
  return rows;
}

// Build a QuizResults payload from the raw per-question answer map.
export function buildQuizResults(a: Record<string, string[]>): QuizResults {
  return {
    scentFamilies: a['scentFamilies'] ?? [],
    favoriteNotes: a['favoriteNotes'] ?? [],
    occasions: a['occasions'] ?? [],
    priorities: a['priorities'] ?? [],
    experienceLevel: a['experienceLevel']?.[0] ?? null,
    collectionSize: a['collectionSize']?.[0] ?? null,
    struggles: a['struggles'] ?? [],
    discoveryStyle: a['discoveryStyle']?.[0] ?? null,
    intensity: a['intensity']?.[0] ?? null,
    personality: a['personality'] ?? [],
    seasons: a['seasons'] ?? [],
    goals: a['goals'] ?? [],
    budget: a['budget']?.[0] ?? null,
    adventurousness: a['adventurousness']?.[0] ?? null,
    signatureStatus: a['signatureStatus']?.[0] ?? null,
    gender: a['gender']?.[0] ?? null,
    completedAt: new Date().toISOString(),
  };
}

function Backdrop() {
  return (
    <>
      <LinearGradient colors={[BG, '#150d06', BG]} style={StyleSheet.absoluteFill} />
      <View style={styles.glowWrap} pointerEvents="none">
        <View style={styles.glowOuter} />
        <View style={styles.glowMid} />
      </View>
    </>
  );
}

export interface ScentQuizProps {
  /** Called with the compiled results once the user finishes the final step. */
  onComplete: (results: QuizResults) => void;
  /** Called when the user backs out from the very first step. */
  onExit: () => void;
  /** If provided, a "Skip" control is shown in the top bar. */
  onSkip?: () => void;
  /** Label for the final CTA. Defaults to "Reveal my Scent DNA". */
  submitLabel?: string;
  /** Prefill answers (e.g. from a previous quiz completion). */
  initialAnswers?: Record<string, string[]>;
  /** Show a spinner + disable the final CTA while the parent persists results. */
  submitting?: boolean;
}

export default function ScentQuiz({
  onComplete,
  onExit,
  onSkip,
  submitLabel = 'Reveal my Scent DNA',
  initialAnswers,
  submitting = false,
}: ScentQuizProps) {
  const insets = useSafeAreaInsets();

  const [flowIndex, setFlowIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(initialAnswers ?? {});
  // One navigation per render — blocks rapid multi-taps from skipping steps
  // or pushing flowIndex out of bounds. Reset whenever the step changes.
  const navLock = useRef(false);

  const quizFade = useRef(new Animated.Value(0)).current;
  const quizSlide = useRef(new Animated.Value(24)).current;

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  }, []);

  useEffect(() => {
    navLock.current = false;
    quizFade.setValue(0);
    quizSlide.setValue(24);
    Animated.parallel([
      Animated.timing(quizFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(quizSlide, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [flowIndex, quizFade, quizSlide]);

  const toggleAnswer = useCallback((key: string, label: string, type: QuizQuestionType) => {
    haptic();
    setAnswers((prev) => {
      const cur = prev[key] ?? [];
      if (type === 'single') {
        return { ...prev, [key]: [label] };
      }
      if (cur.includes(label)) {
        return { ...prev, [key]: cur.filter((s) => s !== label) };
      }
      return { ...prev, [key]: [...cur, label] };
    });
  }, [haptic]);

  const flowNext = useCallback(() => {
    if (navLock.current) return;
    navLock.current = true;
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (flowIndex < QUIZ_FLOW.length - 1) {
      setFlowIndex((i) => Math.min(i + 1, QUIZ_FLOW.length - 1));
    } else {
      onComplete(buildQuizResults(answers));
    }
  }, [flowIndex, answers, onComplete]);

  const flowBack = useCallback(() => {
    if (navLock.current) return;
    navLock.current = true;
    if (flowIndex > 0) {
      setFlowIndex((i) => Math.max(i - 1, 0));
    } else {
      onExit();
    }
  }, [flowIndex, onExit]);

  const step = QUIZ_FLOW[flowIndex];
  if (!step) return null;
  const progress = ((flowIndex + 1) / QUIZ_FLOW.length) * 100;
  const questionSel = step.kind === 'question' ? (answers[step.key] ?? []) : [];
  const minReq = step.kind === 'question' ? (QUESTION_BY_KEY[step.key].min ?? 1) : 0;
  const canAdvance = (step.kind !== 'question' || questionSel.length >= minReq) && !submitting;
  const questionNo = QUIZ_FLOW.slice(0, flowIndex + 1).filter((f) => f.kind === 'question').length;

  const isFinalStep = flowIndex === QUIZ_FLOW.length - 1;
  let ctaLabel = 'Continue';
  let ctaSparkle = false;
  if (step.kind === 'interstitial') {
    if (step.id === 'summary') {
      ctaLabel = submitLabel;
      ctaSparkle = true;
    } else if (step.id === 'solution') {
      ctaLabel = 'I want this';
    } else if (step.id === 'gap') {
      ctaLabel = 'Show me the plan';
    }
  }

  // Answer-derived values for the narrative interstitials.
  const exp = (answers['experienceLevel'] ?? [])[0];
  const col = (answers['collectionSize'] ?? [])[0];
  const discovery = (answers['discoveryStyle'] ?? [])[0];
  const struggles = answers['struggles'] ?? [];
  const goals = answers['goals'] ?? [];
  const families = answers['scentFamilies'] ?? [];
  const notes = answers['favoriteNotes'] ?? [];
  const personality = answers['personality'] ?? [];
  const seasons = answers['seasons'] ?? [];
  const occasions = answers['occasions'] ?? [];
  const intensity = (answers['intensity'] ?? [])[0];
  const budget = (answers['budget'] ?? [])[0];
  const adventurousness = (answers['adventurousness'] ?? [])[0];
  const gender = (answers['gender'] ?? [])[0];

  const summaryGroups = [
    { label: 'Loves', items: families },
    { label: 'Notes', items: notes },
    { label: 'Vibe', items: personality },
    { label: 'Seasons', items: seasons },
    { label: 'Wears for', items: occasions },
    { label: 'Style', items: [intensity, budget, adventurousness, gender].filter(Boolean) as string[] },
    { label: 'Goals', items: goals },
  ];

  return (
    <View style={styles.container}>
      <Backdrop />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={flowBack} style={styles.iconBtn} hitSlop={10}>
          <CaretLeft size={20} color={SUBTEXT} weight="bold" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        {onSkip ? (
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn} hitSlop={10}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipSpacer} />
        )}
      </View>

      <Animated.View style={[styles.quizContent, { opacity: quizFade, transform: [{ translateY: quizSlide }] }]}>
        {step.kind === 'question' ? (
          (() => {
            const q = QUESTION_BY_KEY[step.key];
            return (
              <>
                <Text style={styles.quizEyebrow}>
                  {q.part} · {questionNo} OF {QUIZ_QUESTION_COUNT}
                </Text>
                <Text style={styles.quizTitle}>{q.title}</Text>
                <Text style={styles.quizSubtitle}>{q.subtitle}</Text>

                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={styles.quizOptionsContainer}
                  showsVerticalScrollIndicator={false}
                >
                  {q.options.map((opt) => {
                    const selected = questionSel.includes(opt.label);
                    const OptIcon = opt.icon;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        style={[styles.quizOption, selected && styles.quizOptionSelected]}
                        onPress={() => toggleAnswer(q.key, opt.label, q.type)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.quizOptionLeft}>
                          <View style={[styles.quizOptionIcon, selected && styles.quizOptionIconSelected]}>
                            <OptIcon size={20} color={selected ? GOLD_LIGHT : GOLD} weight="duotone" />
                          </View>
                          <View style={styles.flex}>
                            <Text style={[styles.quizOptionLabel, selected && styles.quizOptionLabelSelected]}>
                              {opt.label}
                            </Text>
                            {opt.sub ? <Text style={styles.quizOptionSub}>{opt.sub}</Text> : null}
                          </View>
                        </View>
                        {q.type === 'single' ? (
                          <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                            {selected ? <View style={styles.radioInner} /> : null}
                          </View>
                        ) : (
                          <View style={[styles.quizCheckbox, selected && styles.quizCheckboxSelected]}>
                            {selected ? <Check size={14} color="#1a1208" weight="bold" /> : null}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            );
          })()
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.interScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step.id === 'status' && (
              <>
                <View style={styles.interBadge}>
                  <MapPin size={14} color={GOLD} weight="fill" />
                  <Text style={styles.interBadgeText}>WHERE YOU ARE TODAY</Text>
                </View>
                <Text style={styles.interTitle}>Here&apos;s your{'\n'}starting point</Text>
                <Text style={styles.interSub}>Everything after this is built around exactly this.</Text>

                <View style={styles.interCard}>
                  {exp ? (
                    <View style={styles.interRow}>
                      <Text style={styles.interRowLabel}>Experience</Text>
                      <Text style={styles.interRowValue}>{exp}</Text>
                    </View>
                  ) : null}
                  {col ? (
                    <>
                      <View style={styles.interDivider} />
                      <View style={styles.interRow}>
                        <Text style={styles.interRowLabel}>Collection</Text>
                        <Text style={styles.interRowValue}>{col} fragrances</Text>
                      </View>
                    </>
                  ) : null}
                  {discovery ? (
                    <>
                      <View style={styles.interDivider} />
                      <View style={styles.interRow}>
                        <Text style={styles.interRowLabel}>Finds scents via</Text>
                        <Text style={styles.interRowValue}>{discovery}</Text>
                      </View>
                    </>
                  ) : null}
                </View>

                {struggles.length > 0 && (
                  <>
                    <Text style={styles.interSectionLabel}>What&apos;s holding you back</Text>
                    <View style={styles.struggleList}>
                      {struggles.map((str) => (
                        <View key={str} style={styles.struggleRow}>
                          <WarningCircle size={18} color="#e8a87c" weight="fill" />
                          <Text style={styles.struggleText}>{str}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {step.id === 'gap' && (
              <>
                <View style={styles.interBadge}>
                  <TrendUp size={14} color={GOLD} weight="fill" />
                  <Text style={styles.interBadgeText}>THE GAP</Text>
                </View>
                <Text style={styles.interTitle}>From where you are{'\n'}to where you want to be</Text>

                <View style={styles.gapBlock}>
                  <Text style={styles.gapBlockLabel}>TODAY</Text>
                  <Text style={styles.gapBlockText}>
                    {[col ? `${col} bottles` : null, exp ? exp.toLowerCase() : null]
                      .filter(Boolean)
                      .join(' · ') || 'Just getting started'}
                  </Text>
                </View>

                <View style={styles.gapArrow}>
                  <ArrowDown size={22} color={GOLD} weight="bold" />
                </View>

                <View style={styles.gapBlockGold}>
                  <Text style={styles.gapBlockLabelGold}>WHERE YOU WANT TO BE</Text>
                  <Text style={styles.gapBlockTextGold}>
                    {goals.length ? goals.slice(0, 2).join(' · ') : 'A collection that feels like you'}
                  </Text>
                </View>

                <View style={styles.gapCallout}>
                  <Text style={styles.gapCalloutText}>
                    That distance is the gap — and closing it by guessing alone is slow and expensive.
                    ScentBuddy gets you there faster.
                  </Text>
                </View>
              </>
            )}

            {step.id === 'solution' && (
              <>
                <View style={styles.interBadge}>
                  <Sparkle size={14} color={GOLD} weight="fill" />
                  <Text style={styles.interBadgeText}>YOUR PERSONAL PLAN</Text>
                </View>
                <Text style={styles.interTitle}>How ScentBuddy{'\n'}closes your gap</Text>
                <Text style={styles.interSub}>Built from your answers — not a generic tour.</Text>

                <View style={styles.solutionList}>
                  {buildSolutions(struggles, goals).map((r) => {
                    const Icon = r.icon;
                    return (
                      <View key={r.title} style={styles.solutionRow}>
                        <View style={styles.solutionIcon}>
                          <Icon size={22} color={GOLD} weight="duotone" />
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.solutionTitle}>{r.title}</Text>
                          <Text style={styles.solutionDesc}>{r.desc}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {step.id === 'summary' && (
              <>
                <View style={styles.interBadge}>
                  <Sparkle size={14} color={GOLD} weight="fill" />
                  <Text style={styles.interBadgeText}>YOUR SCENT SNAPSHOT</Text>
                </View>
                <Text style={styles.interTitle}>This is you,{'\n'}in fragrance</Text>
                <Text style={styles.interSub}>
                  Everything you told us, in one place. Ready for your Scent DNA?
                </Text>

                {summaryGroups.map((grp) =>
                  grp.items.length ? (
                    <View key={grp.label} style={styles.summaryGroup}>
                      <Text style={styles.summaryGroupLabel}>{grp.label}</Text>
                      <View style={styles.chipWrap}>
                        {grp.items.map((it) => (
                          <View key={it} style={styles.chip}>
                            <Text style={styles.chipText}>{it}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null,
                )}
              </>
            )}
          </ScrollView>
        )}
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, !canAdvance && styles.btnDim]}
          onPress={flowNext}
          disabled={!canAdvance}
          activeOpacity={0.9}
        >
          {submitting && isFinalStep ? (
            <ActivityIndicator color="#1a1208" />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
              {ctaSparkle ? (
                <Sparkle size={18} color="#1a1208" weight="fill" />
              ) : (
                <ArrowRight size={18} color="#1a1208" weight="bold" />
              )}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  glowWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  glowOuter: {
    position: 'absolute',
    top: -SCREEN_HEIGHT * 0.12,
    width: SCREEN_HEIGHT * 0.62,
    height: SCREEN_HEIGHT * 0.62,
    borderRadius: SCREEN_HEIGHT * 0.31,
    backgroundColor: 'rgba(196,154,108,0.07)',
  },
  glowMid: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.02,
    width: SCREEN_HEIGHT * 0.34,
    height: SCREEN_HEIGHT * 0.34,
    borderRadius: SCREEN_HEIGHT * 0.17,
    backgroundColor: 'rgba(196,154,108,0.07)',
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 14,
    zIndex: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: GOLD,
  },
  skipBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  skipText: {
    color: FAINT,
    fontSize: 15,
    fontWeight: '600',
  },
  skipSpacer: {
    width: 38,
  },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 26,
    paddingVertical: 17,
    gap: 8,
  },
  primaryBtnText: {
    color: '#1a1208',
    fontSize: 17,
    fontWeight: '800',
  },
  btnDim: {
    opacity: 0.45,
  },

  // Quiz
  quizContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 26,
  },
  quizTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: 8,
  },
  quizSubtitle: {
    fontSize: 16,
    color: SUBTEXT,
    marginBottom: 22,
  },
  quizOptionsContainer: {
    gap: 10,
    paddingBottom: 20,
  },
  quizOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  quizOptionSelected: {
    backgroundColor: 'rgba(196,154,108,0.13)',
    borderColor: 'rgba(196,154,108,0.5)',
  },
  quizOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  quizOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,154,108,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,154,108,0.20)',
  },
  quizOptionIconSelected: {
    backgroundColor: 'rgba(196,154,108,0.20)',
    borderColor: 'rgba(196,154,108,0.45)',
  },
  quizOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(246,241,233,0.82)',
  },
  quizOptionLabelSelected: {
    color: TEXT,
  },
  quizOptionSub: {
    fontSize: 13,
    color: FAINT,
    marginTop: 2,
  },
  quizCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizCheckboxSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  quizEyebrow: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: GOLD,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GOLD,
  },

  // Interstitials (narrative screens)
  interScrollContent: {
    paddingTop: 6,
    paddingBottom: 24,
  },
  interBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(196,154,108,0.12)',
    marginBottom: 14,
  },
  interBadgeText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  interTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.6,
    lineHeight: 37,
    marginBottom: 10,
  },
  interSub: {
    fontSize: 16,
    lineHeight: 23,
    color: SUBTEXT,
    marginBottom: 22,
  },
  interCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  interRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    gap: 12,
  },
  interRowLabel: {
    color: SUBTEXT,
    fontSize: 14,
    fontWeight: '600',
  },
  interRowValue: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  interDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  interSectionLabel: {
    color: FAINT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 24,
    marginBottom: 12,
  },
  struggleList: {
    gap: 8,
  },
  struggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(232,168,124,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.22)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  struggleText: {
    flex: 1,
    color: 'rgba(246,241,233,0.9)',
    fontSize: 15,
    fontWeight: '600',
  },
  gapBlock: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  gapBlockGold: {
    backgroundColor: 'rgba(196,154,108,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(196,154,108,0.5)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  gapBlockLabel: {
    color: FAINT,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  gapBlockLabelGold: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  gapBlockText: {
    color: TEXT,
    fontSize: 17,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  gapBlockTextGold: {
    color: GOLD_LIGHT,
    fontSize: 17,
    fontWeight: '700',
  },
  gapArrow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  gapCallout: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
  },
  gapCalloutText: {
    color: 'rgba(246,241,233,0.72)',
    fontSize: 15,
    lineHeight: 23,
  },
  solutionList: {
    gap: 10,
  },
  solutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    padding: 14,
  },
  solutionIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: 'rgba(196,154,108,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solutionTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  solutionDesc: {
    color: SUBTEXT,
    fontSize: 13.5,
    lineHeight: 19,
  },
  summaryGroup: {
    marginBottom: 18,
  },
  summaryGroupLabel: {
    color: FAINT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(196,154,108,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,154,108,0.3)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: GOLD_LIGHT,
    fontSize: 14,
    fontWeight: '600',
  },
});
