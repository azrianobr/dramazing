> [references/zh/adapters/image.md](../../zh/adapters/image.md)(원본)을 AI가 번역한 문서입니다. 원어민 검토 전입니다.

# 이미지 생성 어댑터

이미지 생성 단계는 결과만 봅니다. 이미지마다 PNG 하나이고, 작업 목록 `tasks.json`에서 그 이미지의 `target` 위치(`sheets/C01.png`, `frames/E01-03/f1.png`)에 두면 됩니다. 어떤 도구로 만들어도 됩니다.

이미지 도구는 두 가지를 할 수 있어야 합니다:

- **참고 이미지를 넣을 수 있어야 합니다.** 콘티 그림은 인물, 장소, 소품의 설정화를 참고해야 얼굴과 의상이 앞뒤로 일관됩니다. 참고 이미지를 넣을 수 없는 도구로는 이미지마다 인물 모습이 달라집니다.
- **작품 화면비대로 이미지를 만들 수 있어야 합니다.** 콘티 그림이 곧 영상의 첫 프레임이므로, 비율이 완성본과 같아야 합니다. `project.json`의 `aspect`이며, 쓰지 않으면 16:9 가로, 세로 작품은 9:16입니다. 설정화는 완성본에 들어가지 않으므로 항상 16:9입니다.

## 네 가지 방식

`--provider`로 고르거나 `project.json`의 `images.provider`에 적습니다.

### manual: 수동 이미지 생성(기본값)

```bash
node scripts/frames.mjs batch --work $W --only "E01-01/"
```

이번 차례에 만들 이미지를 `_handoff/images/`로 내보냅니다. 이미지마다 `.txt` 파일이 하나씩 생기며, 프롬프트, 순서대로 올릴 참고 이미지, 완성본을 둘 위치가 적혀 있습니다. 이것을 가지고 어떤 이미지 도구에서든 만들면 됩니다: ChatGPT, Midjourney, Jimeng, Kling, ComfyUI 모두 됩니다. 다 만들면 되돌려 넣습니다:

```bash
node scripts/frames.mjs place --work $W --target frames/E01-01/f1.png --from ~/Downloads/xxx.webp
```

`place`는 jpg / webp를 PNG로 바꿔 제자리에 두고, 작업 목록에 완료로 기록합니다. 그 자리에 이전 이미지가 있으면 이전 이미지는 `.v<N>.png`로 이름을 바꿔 남겨 둡니다.

### cmd: 직접 쓰는 명령줄 연결

명령줄에서 이미지를 만들 수 있는 도구나 API가 있으면 `project.json`에 명령 템플릿을 적습니다:

```json
"images": {
  "provider": "cmd",
  "cmd": "my-image-tool --prompt-file {prompt} --ref {refs} --out {out}"
}
```

| 자리표시자 | 바뀌는 값 |
|---|---|
| `{prompt}` | 프롬프트 파일 경로(화풍 문장이 이미 붙어 있음) |
| `{refs}` | 참고 이미지 경로, 공백으로 구분, 순서대로 |
| `{out}` | 출력 경로, 작품 폴더 기준 |
| `{work}` | 작품 폴더 |

명령은 작품 폴더 안에서 실행되며, 끝났을 때 `{out}`이 있으면 성공으로 봅니다. 실패하면 오류 출력이 `_logs/img-*.err`에 저장됩니다.

### codex: Codex CLI 내장 이미지 생성(실측함)

《渡口(나루터)》 6화는 이 방식을 썼습니다. [Codex CLI](https://github.com/openai/codex)를 설치하고 로그인해 두어야 합니다. 참고 이미지는 `-i`로 넘기며, 이미지 한 장에 약 2~4분이 걸리고 `--jobs 3`으로 병렬 실행합니다. 이미지마다 사용량이 `_logs/images-usage.jsonl`에 기록됩니다.

### openai: OpenAI 이미지 API(공식 또는 호환 서비스. 호환 서비스로 실측함, 공식 주소는 실측하지 않음)

Codex를 거치지 않고 이미지 API를 직접 부릅니다. 참고 이미지가 있으면 `/images/edits`로 순서대로 올리고, 없으면 `/images/generations`를 씁니다. 한 장에 약 20~40초, `--jobs 3`으로 병렬 실행합니다.

```json
"images": {
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-image-2.5-sunburst"
}
```

- `baseUrl`을 쓰지 않으면 OpenAI 공식 주소를 씁니다. 호환 서비스를 쓸 때는 그 주소로 바꿉니다.
- 키는 환경 변수 `DZ_IMAGES_KEY`에서만 읽고, 어떤 파일에도 쓰지 않습니다. `OPENAI_API_KEY`는 쓰지 않습니다. Codex CLI도 이 변수를 읽어서, 설정하면 Codex가 API 과금으로 바뀔 수 있습니다.
- 크기 값은 보내지 않습니다. 화면 비율은 프롬프트 끝의 '화면 비율' 문장으로 정합니다. 결과 비율이 3% 넘게 어긋나면 경고합니다.
- 장마다 걸린 시간, 실제 크기, 서비스가 돌려준 모델·품질·크기를 `_logs/images-usage.jsonl`에 기록합니다.
- macOS에서 `baseUrl`이 로컬 네트워크 주소면, 터미널 앱을 시스템 설정 → 개인정보 보호 및 보안 → 로컬 네트워크에서 켜야 합니다. 켜지 않으면 `EHOSTUNREACH`가 납니다.

## 이미지 한 장 고치기: fix

```bash
node scripts/frames.mjs fix --work $W --target frames/E01-03/f2.png --prompt <파일>
```

원본이 자동으로 참고 이미지 1이 됩니다. 프롬프트 파일에는 고칠 한 곳만 씁니다. `fix`가 정해진 문장으로 감쌉니다: 이 한 곳만 고치고, 인물 신원·구도·조명·의상은 원본 그대로 둡니다. 한 번에 한 곳만 고치고, 두 곳이면 두 번 실행합니다. 원본 없이 처음부터 다시 그리려면 `--raw`를 붙입니다. `codex`, `cmd`, `openai`에서 쓸 수 있습니다.

## 앵글 고르기: grid

```bash
node scripts/frames.mjs grid --work $W --from frames/E01-03/f1.png --name corridor
```

장소 설정화나 첫 프레임을 참고 이미지 1로 삼아 16:9 격자 한 장을 뽑습니다. 같은 장면, 같은 인물에서 카메라 높이와 숏 크기만 바뀝니다. 끝 문장은 격자 전용 문장(몇 행 몇 열, 칸 사이 가는 흰 선, 글자 없음)으로 바뀝니다. `manual`이면 설명을 `_handoff/grid/<이름>.txt`로 내보냅니다. `openai`로 호환 서비스를 거쳐 실측했습니다(《大水》 사무실, 인물 2명, 1장).

## 도구를 바꿀 때 주의할 점

- **1화에서는 먼저 세그먼트 하나를 만들어 대조합니다.** 얼굴, 의상, 장소가 설정화와 일치하는지 보고 나서 일괄 생성합니다.
- **인물이 일관되지 않으면** 먼저 참고 이미지가 들어갔는지, 순서가 맞는지(설정화가 앞) 확인합니다.
- **젊은 여성**의 설정화와 첫 프레임에는 「이십 대 초반의 성인 여성, 절제된 표정」이라고 밝힙니다. 그렇지 않으면 일부 영상 도구가 미성년자로 판정해 영상 생성을 거부합니다. `../prompt-rules.md`를 보세요.
