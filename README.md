# APA 7th 자동 인용 생성기

현재 활성 웹페이지의 JSON-LD, 메타데이터, 문서 구조를 함께 분석해 편집 가능한 APA 7th 참고문헌을 생성하는 Chrome Extension입니다. Manifest V3와 순수 JavaScript, HTML, CSS만 사용하며 외부 서버로 데이터를 전송하지 않습니다.

## 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위의 **Developer mode**를 켭니다.
3. **Load unpacked**를 누릅니다.
4. 이 프로젝트 폴더를 선택합니다.
5. 일반 `http://` 또는 `https://` 웹페이지에서 확장프로그램 아이콘을 누릅니다.

## 사용법

팝업을 열면 현재 탭을 자동 분석합니다. Title, Author, Date, Website Name, Publisher, URL을 필요에 따라 수정하면 미리보기가 즉시 갱신됩니다. 여러 저자는 세미콜론으로 구분합니다.

**Copy APA Citation**은 가능한 경우 `text/html`과 `text/plain`을 함께 클립보드에 기록합니다. 워드프로세서처럼 rich text를 지원하는 대상에는 제목의 기울임이 유지됩니다. rich clipboard API를 사용할 수 없으면 별표로 기울임을 표시한 plain text가 복사됩니다.

**Re-extract**는 SPA에서 화면이 바뀐 뒤 현재 DOM을 다시 분석할 때 사용합니다. **Debug Details**에는 선택된 출처와 제목, 저자, 날짜 후보별 점수가 표시됩니다.

## 추출 우선순위

제목은 JSON-LD `headline`/`name`, `citation_title`, Open Graph, Twitter, Dublin Core, `article h1`, `main h1`, 기타 `h1`, 본문 안 `h2`, `document.title` 순으로 후보를 모읍니다. 문서 본문과의 위치, 길이, 일반적인 메뉴 문구 등을 반영해 점수화하고 사이트명 suffix를 정리합니다.

저자는 JSON-LD `author.name`, `citation_author`, `author`, `article:author`, `rel=author`, byline/author 관련 class와 id, 화면의 `By …` 패턴 순으로 수집합니다. 찾지 못하면 website name을 기관 저자로 사용합니다.

날짜는 JSON-LD `datePublished`, `article:published_time`, `citation_publication_date`, Dublin Core, `time[datetime]`, 날짜 관련 class/id, 본문 앞부분의 날짜 패턴 순으로 수집합니다. 확정 가능한 날짜가 없으면 `n.d.`를 사용합니다.

website name은 JSON-LD publisher, `og:site_name`, application name, 문서 제목 suffix, 도메인 순으로 찾습니다. publisher는 별도 필드로 보존하지만 웹페이지 APA 형식에서 중복 출판 주체를 추가 출력하지 않습니다.

## APA 7th 출력 규칙

기본 형식은 다음과 같습니다.

`Author. (Year, Month Day). *Title of page*. Website Name. URL`

연도만 알면 `(Year)`, 날짜가 없으면 `(n.d.)`를 사용합니다. 저자와 website name이 같으면 website name을 생략합니다. 저자가 없으면 제목이 맨 앞에 옵니다. **Include retrieval date**를 켜면 URL 앞부분이 `Retrieved Month Day, Year, from URL` 형식으로 바뀝니다.

페이지 제목은 sentence case를 적용하며 미리보기에서는 `<i>` 요소로 표시합니다. plain text 복사에서는 `*Title of page*`로 표시합니다.

## 권한과 개인정보

- `activeTab`: 사용자가 팝업을 연 현재 탭만 분석
- `scripting`: content script가 없는 기존 탭에 로컬 추출 스크립트를 주입
- `storage`: retrieval date 체크 설정 저장

추출은 브라우저 내부에서만 수행되며 외부 서버나 원격 코드가 없습니다.

## 알려진 한계

- paywall, closed shadow DOM, iframe 내부처럼 현재 문서에서 접근할 수 없는 내용은 분석하지 못합니다.
- 잘못 작성된 JSON-LD와 사이트 고유의 비표준 byline은 정확히 해석되지 않을 수 있습니다.
- 쉼표만으로 연결된 저자 목록은 `Last, First` 표기와 충돌할 수 있어 자동 분리가 보수적입니다.
- 한국어 날짜의 완전한 자연어 해석과 동적으로 늦게 로드되는 메타데이터는 제한적입니다. SPA에서는 로딩 후 Re-extract를 사용하십시오.
- `chrome://`, `edge://`, 확장프로그램 스토어 및 기타 브라우저 보호 페이지에는 스크립트를 주입할 수 없습니다.

## 향후 개선 방향

- DOI 추출
- 학술논문 인용
- CSL JSON export
- BibTeX export
- 여러 인용 스타일 지원
