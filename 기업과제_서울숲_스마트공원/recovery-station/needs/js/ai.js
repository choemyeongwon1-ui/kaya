// 관리자 화면의 AI 도우미. 공식 Anthropic SDK로 Claude를 부릅니다.
// - SDK는 AI를 처음 쓸 때만 불러옵니다(vendor/anthropic-sdk.mjs, @anthropic-ai/sdk를 한 파일로 묶은 것).
// - API 키는 쓰는 사람이 직접 넣습니다. 이 브라우저에만 저장되고 Anthropic API로만 보냅니다.
// - 보내는 자료는 집계값과 장소 이름뿐입니다(rest.js의 briefData). 개인정보는 들어가지 않습니다.
import { AI } from './config.js';

let Anthropic = null;
async function loadSdk() {
  if (!Anthropic) Anthropic = (await import('../vendor/anthropic-sdk.mjs')).default;
  return Anthropic;
}

/** API 키 보관: 기본은 탭을 닫으면 지워지는 sessionStorage, '기억'을 고르면 localStorage */
export const keyStore = {
  get() { try { return sessionStorage.getItem(AI.keyStore) || localStorage.getItem(AI.keyStore) || ''; } catch { return ''; } },
  remembered() { try { return !!localStorage.getItem(AI.keyStore); } catch { return false; } },
  set(key, remember) {
    try {
      sessionStorage.setItem(AI.keyStore, key);
      if (remember) localStorage.setItem(AI.keyStore, key); else localStorage.removeItem(AI.keyStore);
    } catch { /* 저장이 막힌 브라우저에서는 이번 화면에서만 씁니다 */ }
  },
  clear() { try { sessionStorage.removeItem(AI.keyStore); localStorage.removeItem(AI.keyStore); } catch { /* 무시 */ } },
};

const SYSTEM = `당신은 서울숲 공원 관리 담당자를 돕는 분석 보조입니다. 담당자는 공원에서 쉬기 어려운 곳을 줄이려고 벤치·그늘·화장실을 어디에 둘지 정해야 합니다.

대화 첫머리의 <자료>는 대시보드가 20m 칸 단위로 계산한 진단 결과와 시설 배치 제안입니다. 답은 이 자료에 근거해 주세요. 자료에 없는 수치는 만들지 말고, 필요하면 무엇을 더 조사해야 하는지 말해 주세요.

자료의 한계를 알고 판단해 주세요.
- 앉을 곳은 OpenStreetMap에 등록된 것과 현장 조사로 더한 것만 반영되어 실제보다 적게 잡혀 있을 수 있습니다. '앉을 곳이 멂'이 넓게 나오면 시설을 새로 놓기 전에 현장 확인이 먼저일 수 있습니다.
- 붐빔 지수는 계수 자료가 아니라 추정값입니다.
- 나무 그늘은 여름 위성 영상 기준이라 겨울에는 다릅니다.

담당자가 바로 일에 쓸 수 있게 한국어로, 짧고 분명하게 써 주세요. 먼저 결론을 말하고 근거 수치를 붙입니다. 제목은 '## ', 항목은 '- ', 강조는 '**'만 쓰고 표는 쓰지 않습니다.`;

/** 자료를 첫 사용자 메시지로 만듭니다 */
export function firstMessage(data, task) {
  return `<자료>\n${JSON.stringify(data, null, 1)}\n</자료>\n\n${task}`;
}
export const REPORT_TASK = `이 진단을 바탕으로 관리자용 짧은 보고를 써 주세요.
1) 지금 상황 한 줄 요약
2) 먼저 손봐야 할 구역 세 곳과 이유
3) 제안된 벤치·그늘·화장실 자리 가운데 효과가 큰 순서와, 다시 생각해 볼 자리
4) 시설을 놓기 전에 현장에서 확인할 것
전체 500자 안팎으로 써 주세요.`;

export class AIError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

/**
 * Claude에 묻습니다(스트리밍).
 * messages: [{role: 'user'|'assistant', content: string}] / onText(지금까지의 글): 글이 올 때마다 호출
 * 반환: {text, model, stopReason, fallback(다른 모델이 이어 답했는지), usage}
 */
export async function askAI({ apiKey, messages, onText, signal }) {
  if (!apiKey) throw new AIError('nokey', 'API 키를 먼저 넣어 주세요.');
  const Sdk = await loadSdk();
  const client = new Sdk({ apiKey, dangerouslyAllowBrowser: true });
  let text = '';
  try {
    const stream = client.beta.messages.stream({
      model: AI.model,
      max_tokens: AI.maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: AI.effort },
      betas: [AI.fallbackBeta],
      fallbacks: 'default',
      system: SYSTEM,
      messages,
    }, { signal });
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'fallback') { text = ''; onText?.(text); }   // 다른 모델이 이어받으면 앞의 글은 버립니다
      else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') { text += event.delta.text; onText?.(text); }
    }
    const final = await stream.finalMessage();
    // 내용을 읽기 전에 거절 여부부터 봅니다
    if (final.stop_reason === 'refusal') throw new AIError('refusal', '모델이 이 요청에는 답하지 않았습니다. 질문을 바꿔 다시 시도해 주세요.');
    // 다른 모델이 이어받았으면(fallback 블록) 그 뒤의 글만 답으로 씁니다
    const lastFallback = final.content.map(b => b.type).lastIndexOf('fallback');
    const answer = final.content.slice(lastFallback + 1).filter(b => b.type === 'text').map(b => b.text).join('');
    return { text: answer || text, model: final.model, stopReason: final.stop_reason, fallback: lastFallback >= 0, usage: final.usage };
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof Sdk.APIUserAbortError) throw new AIError('aborted', '요청을 멈췄습니다.');
    if (err instanceof Sdk.AuthenticationError) throw new AIError('auth', 'API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.');
    if (err instanceof Sdk.PermissionDeniedError) throw new AIError('permission', '이 키로는 이 모델을 쓸 수 없습니다. 계정의 모델 사용 권한을 확인해 주세요.');
    if (err instanceof Sdk.NotFoundError) throw new AIError('model', `이 키로는 모델(${AI.model})을 쓸 수 없습니다. js/config.js의 AI.model을 계정에서 쓸 수 있는 모델로 바꿔 주세요.`);
    if (err instanceof Sdk.RateLimitError) throw new AIError('rate', '요청이 몰려 잠시 막혔습니다. 조금 뒤에 다시 시도해 주세요.');
    if (err instanceof Sdk.BadRequestError) throw new AIError('bad', `요청을 처리하지 못했습니다: ${err.message}`);
    if (err instanceof Sdk.InternalServerError) throw new AIError('busy', 'Anthropic 쪽이 잠시 바쁩니다. 조금 뒤에 다시 시도해 주세요.');
    if (err instanceof Sdk.APIConnectionError) throw new AIError('network', 'Anthropic API에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
    if (err instanceof Sdk.APIError) throw new AIError('api', `API 오류(${err.status ?? '알 수 없음'}): ${err.message}`);
    throw err;
  }
}
