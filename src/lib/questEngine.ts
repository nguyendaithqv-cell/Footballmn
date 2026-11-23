import { CareerSave, QuestItem, QuestMetric, QuestsState } from '../types/game';
import { appendLedgerEntries, createLedgerEntry } from './careerEngine';
import { normalizeInventory } from './inventoryEngine';

export function getTodayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentWeekKey(): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function buildDailyQuests(dailyKey: string): QuestItem[] {
  return [
    {
      id: `dq-play-${dailyKey}`,
      category: 'daily',
      metric: 'match_played',
      title: 'Ra sân Hàng ngày',
      description: 'Hoàn thành 2 trận đấu chính thức (VĐQG, Cúp C1, Cúp QG hoặc Siêu Cúp).',
      target: 2,
      progress: 0,
      claimed: false,
      rewardShards: 12,
      rewardBudgetM: 0.8,
      rewardBoosters: 1,
    },
    {
      id: `dq-win-${dailyKey}`,
      category: 'daily',
      metric: 'match_win',
      title: 'Khí thế Chiến thắng',
      description: 'Giành chiến thắng 1 trận đấu chính thức bất kỳ.',
      target: 1,
      progress: 0,
      claimed: false,
      rewardShards: 15,
      rewardBudgetM: 1.0,
      rewardBoosters: 0,
      rewardPack: 'scout_pack',
    },
    {
      id: `dq-online-${dailyKey}`,
      category: 'daily',
      metric: 'online_match',
      title: 'Thử lửa Đấu trường Online',
      description: 'Thi đấu 1 trận Đấu Hạng, Tỷ Thí 1v1 hoặc Đấu Giải Online.',
      target: 1,
      progress: 0,
      claimed: false,
      rewardShards: 18,
      rewardBudgetM: 0.6,
      rewardBoosters: 1,
    },
  ];
}

function buildWeeklyQuests(weeklyKey: string): QuestItem[] {
  return [
    {
      id: `wq-goals-${weeklyKey}`,
      category: 'weekly',
      metric: 'goal_scored',
      title: 'Hỏa lực Hủy diệt Tuần',
      description: 'Ghi tổng cộng 10 bàn thắng ở các trận chính thức trong tuần.',
      target: 10,
      progress: 0,
      claimed: false,
      rewardShards: 45,
      rewardBudgetM: 2.5,
      rewardBoosters: 2,
      rewardPack: 'elite_pack',
    },
    {
      id: `wq-clean-${weeklyKey}`,
      category: 'weekly',
      metric: 'clean_sheet',
      title: 'Bức tường Thép',
      description: 'Giữ sạch lưới 2 trận đấu chính thức trong tuần.',
      target: 2,
      progress: 0,
      claimed: false,
      rewardShards: 35,
      rewardBudgetM: 2.0,
      rewardBoosters: 1,
    },
    {
      id: `wq-dev-${weeklyKey}`,
      category: 'weekly',
      metric: 'training_or_star',
      title: 'Nâng tầm Đội hình',
      description: 'Nâng sao thẻ, tập luyện Học viện hoặc điều chỉnh giáo án 3 lần.',
      target: 3,
      progress: 0,
      claimed: false,
      rewardShards: 40,
      rewardBudgetM: 1.5,
      rewardBoosters: 2,
      rewardPack: 'scout_pack',
    },
  ];
}

export function ensureQuestsState(careerOrState?: CareerSave | QuestsState | null | undefined): QuestsState {
  const dailyKey = getTodayKey();
  const weeklyKey = getCurrentWeekKey();
  const existing = careerOrState && typeof careerOrState === 'object' && 'quests' in careerOrState
    ? (careerOrState as CareerSave).quests
    : (careerOrState as QuestsState | undefined);

  if (existing && existing.dailyKey === dailyKey && existing.weeklyKey === weeklyKey && Array.isArray(existing.items)) {
    return existing;
  }

  const keptDaily =
    existing?.dailyKey === dailyKey
      ? existing.items.filter((q) => q.category === 'daily')
      : buildDailyQuests(dailyKey);
  const keptWeekly =
    existing?.weeklyKey === weeklyKey
      ? existing.items.filter((q) => q.category === 'weekly')
      : buildWeeklyQuests(weeklyKey);

  return {
    dailyKey,
    weeklyKey,
    items: [...keptDaily, ...keptWeekly],
  };
}

export function applyQuestProgressToCareer(
  career: CareerSave,
  updates: Partial<Record<QuestMetric, number>>
): CareerSave {
  const current = ensureQuestsState(career);
  let changed = !career.quests || career.quests.dailyKey !== current.dailyKey || career.quests.weeklyKey !== current.weeklyKey;

  const nextItems = current.items.map((q) => {
    const inc = updates[q.metric] ?? 0;
    if (inc <= 0 || q.claimed || q.progress >= q.target) return q;
    changed = true;
    return {
      ...q,
      progress: Math.min(q.target, q.progress + inc),
    };
  });

  if (!changed) return career;
  return {
    ...career,
    quests: {
      ...current,
      items: nextItems,
    },
  };
}

export function claimQuestRewardOnCareer(
  career: CareerSave,
  questId: string
): {
  ok: boolean;
  message: string;
  nextCareer: CareerSave;
  claimedQuest?: QuestItem;
} {
  const current = ensureQuestsState(career);
  const target = current.items.find((q) => q.id === questId);
  if (!target) {
    return { ok: false, message: 'Không tìm thấy nhiệm vụ này.', nextCareer: career };
  }
  if (target.claimed) {
    return { ok: false, message: 'Bạn đã nhận thưởng nhiệm vụ này rồi.', nextCareer: career };
  }
  if (target.progress < target.target) {
    return { ok: false, message: 'Nhiệm vụ chưa hoàn thành đủ tiến độ.', nextCareer: career };
  }

  const inv = normalizeInventory(career.inventory);
  const nextPacks = { ...inv.packs };
  if (target.rewardPack) {
    nextPacks[target.rewardPack] = (nextPacks[target.rewardPack] ?? 0) + 1;
  }

  const nextInv = normalizeInventory({
    ...inv,
    packs: nextPacks,
    universalShards: inv.universalShards + target.rewardShards,
    fitnessBoosters: inv.fitnessBoosters + target.rewardBoosters,
  });

  const nextItems = current.items.map((q) =>
    q.id === questId ? { ...q, claimed: true } : q
  );

  const nextCareer: CareerSave = {
    ...career,
    transferBudget: Number((career.transferBudget + target.rewardBudgetM).toFixed(2)),
    inventory: nextInv,
    quests: {
      ...current,
      items: nextItems,
    },
    financialLedger:
      target.rewardBudgetM > 0
        ? appendLedgerEntries(career.financialLedger, [
            createLedgerEntry({
              season: career.season,
              matchweek: career.matchweek,
              type: 'income',
              category: 'quest_reward',
              title: `Thưởng Nhiệm vụ: ${target.title}`,
              detail: `+${target.rewardShards} Mảnh Ngôi Sao`,
              amountM: target.rewardBudgetM,
            }),
          ])
        : career.financialLedger,
  };

  return {
    ok: true,
    message: `Nhận thưởng "${target.title}": +€${target.rewardBudgetM}M, +${target.rewardShards} Mảnh${target.rewardBoosters > 0 ? `, +${target.rewardBoosters} Bình Thể Lực` : ''}${target.rewardPack ? ' & +1 Gói Thẻ!' : '!'}`,
    nextCareer,
    claimedQuest: target,
  };
}
