dorm-menu : 서울과기대 생활관 식단 알리미
==========================================

생활관 홈페이지의 식단표를 받아 학사별 메뉴를 일/주/월 단위로
터미널에 보여 주고, 내가 정한 규칙("내일 아침 메뉴를 매일 21:00에")
에 맞춰 알림을 띄운다. 알림은 학교 서버의 PuTTY 창과 내 PC
(Windows 알림) 양쪽으로 받을 수 있다.

전부 C로 작성했다. HTTPS는 함께 넣은 BearSSL 라이브러리로 직접
처리하므로 curl 같은 외부 프로그램이 필요 없다.


1. 빌드
-------

    make             처음에는 BearSSL도 함께 컴파일 (조금 걸림)
    make install     ~/bin/dorm-menu 로 복사
    make clean       우리 코드 빌드 결과만 지우기
    make distclean   BearSSL 빌드 결과(build/)까지 지우기


2. 사용법
---------

    dorm-menu                    오늘 식단
    dorm-menu week               이번 주 (월~일)
    dorm-menu month              이번 달 (올라온 주까지)
    dorm-menu next               다음 끼니
    dorm-menu --dorm surim week  학사 지정
    dorm-menu -D 2026-11-25      다른 날짜 기준으로 보기
    dorm-menu -r today           저장된 식단 무시하고 새로 받기

    dorm-menu show 내일 점심      오늘|내일 아침|점심|저녁 메뉴

    dorm-menu alarm add 내일 아침 21:00 surim
                                 매일 21:00에 내일 아침 메뉴를 알림
    dorm-menu alarm add 오늘 점심 10:30 kb
    dorm-menu help               사용 설명서 (-h 도 같음)
    dorm-menu alarm list         알림 규칙 보기 (번호 포함)
    dorm-menu alarm del 2        2번 규칙 지우기

    dorm-menu daemon             상주 모드 시작 (백그라운드)
    dorm-menu daemon -f          상주 모드를 터미널에서 실행
                                 (Ctrl+C로 끝)
    dorm-menu stop               상주 모드 끝내기

  학사 값
    kb        KB학사 식당 (불암, KB, 창명)
    sunglim   성림학사 식당 (성림, 누리)
    surim     수림학사 식당


3. 설정 파일 dorm_menurc
-----------------------

  실행 파일(dorm-menu)과 같은 폴더의 dorm_menurc 를 읽는다.
  어느 폴더에서 실행해도, 상주 모드에서도 같은 파일을 쓴다.

    dorm = kb            기본 학사
    # tty = /dev/pts/3   알림 보낼 터미널을 고정할 때만

  줄이 없거나 파일이 없으면 기본값(kb)이다. 알림 시각은 이 파일이
  아니라 alarm 명령으로 정한다(규칙은 ~/.dorm_menu/alarms 에 저장).
  상주 모드가 돌고 있으면 alarm add/del 직후 SIGHUP으로 자동으로
  다시 읽는다. 설정 파일을 고쳤을 때는 아래 명령으로 다시 읽게 한다.

    kill -HUP `cat ~/.dorm_menu/daemon.pid`


4. 알림 방식
------------

  알림 규칙
    "<오늘|내일> <아침|점심|저녁> <HH:MM>" 한 줄이 규칙 하나다.
    매일 그 시각에 (그날 + 오늘/내일)의 그 끼니 메뉴를 알린다.
      alarm add 내일 아침 21:00 surim   매일 밤 9시에 수림 내일 아침 메뉴
      alarm add 오늘 점심 10:30 kb      매일 10시 30분에 KB 오늘 점심 메뉴
    학사(kb|sunglim|surim)는 규칙마다 반드시 적는다.

  상주 모드 (daemon)
    fork, setsid로 터미널에서 떨어진 뒤, 규칙 중 가장 가까운 시각
    까지 alarm()을 걸고 sigsuspend()로 잠든다.
      SIGALRM          그 시각의 규칙들을 알리고 다음 시각을 계산
      SIGHUP           설정과 규칙 다시 읽기
      SIGINT, SIGTERM  종료 (atexit로 pid 파일 삭제)
    같은 계정에서 두 번 실행되지 않는다.

  내 PC로 받기 (Local/)
    학교 서버는 내 PC로 먼저 연결할 수 없다. 그래서 PC가 서버에
    물어보는 방식이다. PC의 작업 스케줄러가 규칙의 시각마다
    ssh로 서버에 show 를 실행하고, 결과를 Windows 알림으로 띄운다.
    PC가 꺼져 있던 시각의 알림은 켠 직후에 뜬다.

      Local\dorm.ps1 alarm add 내일 아침 21:00 surim
                      서버에 규칙 등록 + Windows 작업 자동 등록
      Local\dorm.ps1 alarm del 1     규칙 삭제 + 작업 자동 정리
      Local\dorm-sync.ps1            서버 규칙과 PC 작업을 맞춤
                      (로그인할 때와 5분마다 자동 실행. 서버에서
                      직접 규칙을 바꿨을 때도 여기서 반영된다)

    사전 준비: PC에서 ssh comunix 가 비밀번호 없이 접속돼야 한다.
    처음 한 번 dorm-sync.ps1 을 실행하면 동기화 작업이 등록된다.

  표시
    utmpx(getutxent)에서 내 계정으로 로그인한 터미널을 모두 찾아
    /dev/pts/N 을 open, write 한다. PuTTY 창에 벨과 함께 노란
    글씨로 뜬다. 열린 터미널이 없으면 ~/.dorm_menu/daemon.log 에
    남긴다. GUI가 있는 Linux면 notify-send도 함께 띄운다.

  next 명령은 "아직 끝나지 않은 가장 가까운 끼니"를 고른다.
  끝나는 시각은 생활관 식당 이용시간(학기) 기준이다.
      평일  09:00 / 14:00 / 18:50
      주말  09:00 / 13:30 / 18:30


5. 만들어지는 파일
------------------

    ~/.dorm_menu/<학사>-<월요일>.html   주 단위 원본 HTML
    ~/.dorm_menu/daemon.pid            상주 모드 pid
    ~/.dorm_menu/daemon.log            상주 모드 로그
    ~/.dorm_menu/published.log         미등록이던 주가 처음 올라온
                                       것을 본 시각 (게시 시점 관찰)

  사이트에 부담을 주지 않으려고 저장된 식단을 먼저 쓴다.
    - 다 올라온 주: 12시간 지나야 다시 받음
    - 미등록 날이 있는 주: 3시간 지나야 다시 받음
    - 지난 주: 다시 받지 않음
    - 다음 주보다 먼 주: 요청하지 않음
  받기에 실패하면 저장된 식단을 경고와 함께 보여 준다.


6. 구조와 쓴 함수
-----------------

  Source/main.c      명령 처리
  Source/alarm.c     알림 규칙 저장과 alarm add/list/del
                     fopen, fgets, rename, unlink, kill(SIGHUP)
  Local/*.ps1        PC용 스크립트 (Windows 작업 스케줄러, 토스트)
  Source/fetch.c     페이지 받기. 자식 프로세스가 받아 pipe로 전달,
                     30초 제한
                     pipe, fork, alarm, signal, sigprocmask, read,
                     waitpid, _exit
  Source/https.c     HTTPS POST
                     getaddrinfo, socket, connect, read, write,
                     close + BearSSL
  Source/cache.c     주 단위 저장
                     mkdir, stat(st_mtime), open, write, rename,
                     unlink, fstat
  Source/parse.c     <table class="chang"> 파싱 (문자열 함수)
  Source/date.c      오늘, 이번 주, 이번 달 범위
                     time, localtime, mktime, strftime
  Source/config.c    설정 파일 읽기, 실행 파일 위치 찾기
                     getenv, getpwuid, realpath, access, fopen,
                     fgets
  Source/notify.c    터미널 알림
                     getutxent, open(O_NOCTTY|O_NONBLOCK), write,
                     fork + execlp("notify-send")
  Source/daemon.c    상주 모드
                     fork, setsid, umask, chdir, dup2, sigaction,
                     sigprocmask, alarm, sigsuspend, kill, atexit
  Source/menu.h          공용 선언
  Source/trust_anchor.h  사이트 인증서를 검증할 최상위 인증서


7. 왜 BearSSL을 넣었나
----------------------

  학교 서버(comunix, Solaris 11.3)의 OpenSSL 1.0.1p에는 ECDHE
  암호 방식이 없다. 그런데 식단 사이트는 TLS 1.2에서
  ECDHE-RSA-AES-GCM만 받는다. 그래서 서버의 curl은
  "(35) SSL protocol error"로 실패한다.

  ECDHE를 지원하는 작은 C TLS 라이브러리 BearSSL 0.6
  (https://bearssl.org/, MIT 라이선스)을 third_party/bearssl 에
  넣고 함께 빌드한다. 서버 인증서는 Source/trust_anchor.h 의
  DigiCert Global Root G2로 검증한다.


8. 사이트에서 확인한 것 (2026-11-18)
------------------------------------

  - 로그인, JavaScript 없이 HTML에 식단이 들어 있다.
  - POST foodtype=..&year=..&month=..&day=.. 는 그 날짜부터 7일을
    돌려준다 (그 날짜가 속한 주가 아님). 그래서 항상 월요일로
    요청한다.
  - 날짜 칸에는 일(日)만 있다. 연/월은 요청한 월요일에서 계산하고
    칸의 일과 맞지 않으면 파싱 오류로 처리한다.
  - 올라오지 않은 날은 칸에 "미등록"만 있다.
  - 11/18(수) 저녁에 KB는 다음 주가 이미 올라와 있었고 수림은
    미등록이었다. 학사마다 게시 시점이 다르다.


9. 한계
-------

  - 월간 보기는 지난 주부터 다음 주까지만 채워진다.
    식단이 한 주씩 올라오기 때문이다.
  - 식당 끝나는 시각은 학기 기준으로 고정돼 있다.
  - 출력은 UTF-8이다. PuTTY 설정에서
    Window > Translation > Remote character set 이 UTF-8이어야
    한글이 보인다.


10. 웹 앱과 Android 앱 (SsalTech)
---------------------------------

  같은 기능을 휴대폰에서 쓰도록 만든 모바일 웹 앱과, 그 웹 앱을
  띄우고 정한 시각에 알림을 울리는 Android 앱이다. C 코드(Source/)는
  건드리지 않았고 사이트 요청·파싱 규칙(8절)을 TypeScript로 옮겼다.

    https://dorm.ybkim.pe.kr       웹 앱 (아이폰은 홈 화면에 추가)
    https://dorm.ybkim.pe.kr/ssaltech.apk   Android 앱

  web/  (Next.js, Vercel 서울 리전 icn1)
    src/lib/site.ts    생활관 사이트에서 주 단위로 받기 (항상 월요일)
    src/lib/menu.ts    <table class="chang"> 파싱, 날짜 계산
    src/app/api/menu   GET ?dorm=kb&date=YYYY-MM-DD → 그 주 7일
                       다 올라온 주는 CDN에 12시간 캐시
    src/app/api/notify GET ?dorm&date&meal → 알림 제목·본문 한 끼
    src/ui/            화면 (오늘·식단·알림·알레르기·MY)
    알레르기는 사이트에 번호가 없어 메뉴 이름으로 짐작한다.
    설정·별점·알림 규칙은 그 기기(localStorage)에만 저장한다.

      cd web && npm install && npm run dev

  android/  (Java, 외부 라이브러리 없음, minSdk 26)
    MainActivity   WebView로 웹 앱을 띄운다
    Bridge         웹 앱의 window.SsalTechNative (web/src/ui/native.ts)
    Alarms         규칙마다 다음 시각을 AlarmManager 정확한 알람으로
                   예약. 울릴 때 /api/notify 에서 메뉴를 받아 알림을
                   띄우고 다음 시각을 다시 예약한다.
    BootReceiver   재부팅·업데이트·시계 변경 뒤 다시 예약

      cd android && ./gradlew assembleRelease
      ./gradlew assembleDebug -PbaseUrl=http://10.0.2.2:3000
                                 에뮬레이터에서 로컬 웹 서버로 시험

    서명 키는 저장소 밖에 둔다. android/keystore.properties 에
    storeFile, storePassword, keyAlias, keyPassword 를 적으면
    release 빌드에 쓰인다. 만든 APK는 web/public/ssaltech.apk 로
    복사해 웹과 함께 배포한다.

  웹 브라우저에는 정한 시각에 알림을 울릴 방법이 없어서, 웹에서는
  알림 규칙만 정하고 실제 알림은 Android 앱이 울린다. 앱의 규칙은
  앱 안 WebView에 따로 저장된다.
