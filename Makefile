# POSIX make 문법만 사용 (GNU make에서 확인, Solaris make는 미확인)
CC = gcc
WARN = -Wall -Wextra
BEARSSL = third_party/bearssl
CFLAGS = -std=c99 -O2 $(WARN) -D_XOPEN_SOURCE=600 -D__EXTENSIONS__ -I$(BEARSSL)/inc
BEARSSL_CFLAGS = -O2
PREFIX = $(HOME)

PROG = dorm-menu
OBJS = Source/main.o Source/date.o Source/config.o Source/fetch.o Source/https.o \
       Source/cache.o Source/parse.o Source/display.o Source/notify.o Source/daemon.o \
       Source/alarm.o
BEARSSL_LIB = build/libbearssl.a

all: $(PROG)

# Solaris는 socket·getaddrinfo가 libsocket·libnsl에 있다
$(PROG): $(OBJS) $(BEARSSL_LIB)
	libs=; if [ "`uname -s`" = SunOS ]; then libs="-lsocket -lnsl"; fi; \
	$(CC) $(CFLAGS) -o $(PROG) $(OBJS) $(BEARSSL_LIB) $$libs

$(OBJS): Source/menu.h
Source/https.o: Source/trust_anchor.h

.c.o:
	$(CC) $(CFLAGS) -c -o $@ $<

# BearSSL 0.6 (TLS 1.2, ECDHE). 소스 파일 이름이 겹치지 않아 한 디렉터리에 모아 컴파일한다
$(BEARSSL_LIB):
	rm -rf build/bearssl
	mkdir -p build/bearssl
	cd build/bearssl && $(CC) $(BEARSSL_CFLAGS) -I../../$(BEARSSL)/inc -I../../$(BEARSSL)/src \
		-c ../../$(BEARSSL)/src/*.c ../../$(BEARSSL)/src/*/*.c
	ar rcs $(BEARSSL_LIB) build/bearssl/*.o

install: $(PROG)
	mkdir -p $(PREFIX)/bin
	cp $(PROG) $(PREFIX)/bin/$(PROG)

clean:
	rm -f $(PROG) $(OBJS)

distclean: clean
	rm -rf build

.PHONY: all install clean distclean
