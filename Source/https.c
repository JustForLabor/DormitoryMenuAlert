/* https.c - HTTPS POST: getaddrinfo, socket, connect, read/write + BearSSL(TLS)
 *
 * 학교 서버(Solaris 11.3)의 OpenSSL 1.0.1p에는 ECDHE가 없고, 사이트는 TLS 1.2에서
 * ECDHE-RSA-AES-GCM만 받는다. 그래서 curl 대신 BearSSL(third_party/bearssl)로
 * TLS를 직접 처리한다. 인증서는 Source/trust_anchor.h의 루트로 검증한다.
 */
#include <errno.h>
#include <netdb.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

#include "bearssl.h"
#include "menu.h"
#include "trust_anchor.h"

#define HEADER_MAX 16384

static int tcp_connect(const char *host, const char *port)
{
    struct addrinfo hints, *res, *ai;
    int fd = -1, rc;

    memset(&hints, 0, sizeof hints);
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    if ((rc = getaddrinfo(host, port, &hints, &res)) != 0) {
        fprintf(stderr, "https: %s 주소를 찾지 못했습니다: %s\n", host, gai_strerror(rc));
        return -1;
    }
    for (ai = res; ai != NULL; ai = ai->ai_next) {
        if ((fd = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol)) < 0)
            continue;
        if (connect(fd, ai->ai_addr, ai->ai_addrlen) == 0)
            break;
        close(fd);
        fd = -1;
    }
    freeaddrinfo(res);
    if (fd < 0)
        fprintf(stderr, "https: %s:%s 연결 실패: %s\n", host, port, strerror(errno));
    return fd;
}

/* BearSSL이 암호화된 바이트를 소켓에 주고받을 때 부르는 함수 */
static int sock_read(void *ctx, unsigned char *buf, size_t len)
{
    ssize_t n;

    while ((n = read(*(int *)ctx, buf, len)) < 0 && errno == EINTR)
        ;
    return n > 0 ? (int)n : -1;
}

static int sock_write(void *ctx, const unsigned char *buf, size_t len)
{
    ssize_t n;

    while ((n = write(*(int *)ctx, buf, len)) < 0 && errno == EINTR)
        ;
    return n > 0 ? (int)n : -1;
}

static int write_all(int fd, const char *p, size_t len)
{
    ssize_t n;

    while (len > 0) {
        if ((n = write(fd, p, len)) < 0) {
            if (errno == EINTR)
                continue;
            return -1;
        }
        p += n;
        len -= (size_t)n;
    }
    return 0;
}

/* 헤더에서 "Name: 값"의 값 시작 위치. 대소문자 무시 */
static const char *header_value(const char *headers, const char *name)
{
    size_t n = strlen(name);
    const char *line = strstr(headers, "\r\n");

    while (line != NULL && line[2] != '\r') {
        line += 2;
        if (strncasecmp(line, name, n) == 0 && line[n] == ':') {
            line += n + 1;
            while (*line == ' ')
                line++;
            return line;
        }
        line = strstr(line, "\r\n");
    }
    return NULL;
}

int https_post(const char *host, const char *path, const char *form, int out_fd)
{
    static unsigned char iobuf[BR_SSL_BUFSIZE_BIDI];
    static char head[HEADER_MAX + 1];
    br_ssl_client_context sc;
    br_x509_minimal_context xc;
    br_sslio_context ioc;
    char req[1024];
    const char *v;
    size_t head_len = 0, body_len = 0;
    long content_length = -1;
    int fd, n, req_len, status = 0, in_body = 0, err;

    req_len = snprintf(req, sizeof req,
                       "POST %s HTTP/1.0\r\n"
                       "Host: %s\r\n"
                       "User-Agent: dorm-menu\r\n"
                       "Content-Type: application/x-www-form-urlencoded\r\n"
                       "Content-Length: %lu\r\n"
                       "Connection: close\r\n"
                       "\r\n%s",
                       path, host, (unsigned long)strlen(form), form);
    if (req_len < 0 || (size_t)req_len >= sizeof req)
        return -1;
    if ((fd = tcp_connect(host, "443")) < 0)
        return -1;

    br_ssl_client_init_full(&sc, &xc, TAs, TAs_NUM);
    br_ssl_engine_set_buffer(&sc.eng, iobuf, sizeof iobuf, 1);
    br_ssl_client_reset(&sc, host, 0); /* host는 SNI와 인증서 이름 검사에 쓰인다 */
    br_sslio_init(&ioc, &sc.eng, sock_read, &fd, sock_write, &fd);

    /* 첫 쓰기에서 TLS 핸드셰이크가 일어난다 */
    if (br_sslio_write_all(&ioc, req, (size_t)req_len) < 0 || br_sslio_flush(&ioc) < 0)
        goto tls_fail;

    for (;;) {
        unsigned char tmp[4096];

        n = br_sslio_read(&ioc, tmp, sizeof tmp);
        if (n < 0)
            break; /* 서버가 연결을 닫음 (또는 오류: 아래에서 구분) */

        if (!in_body) {
            char *end;

            if (head_len + (size_t)n > HEADER_MAX) {
                fprintf(stderr, "https: 응답 헤더가 너무 깁니다\n");
                goto fail;
            }
            memcpy(head + head_len, tmp, (size_t)n);
            head_len += (size_t)n;
            head[head_len] = '\0';
            if ((end = strstr(head, "\r\n\r\n")) == NULL)
                continue;

            in_body = 1;
            end[2] = '\0'; /* 헤더만 남긴다 (마지막 줄의 \r\n은 유지) */
            if (sscanf(head, "HTTP/%*d.%*d %d", &status) != 1 || status != 200) {
                fprintf(stderr, "https: 서버 응답 %d\n", status);
                goto fail;
            }
            if ((v = header_value(head, "Transfer-Encoding")) != NULL &&
                strncasecmp(v, "chunked", 7) == 0) {
                fprintf(stderr, "https: chunked 응답은 지원하지 않습니다\n");
                goto fail;
            }
            if ((v = header_value(head, "Content-Length")) != NULL)
                content_length = strtol(v, NULL, 10);
            /* 헤더 뒤에 같이 온 본문은 head 버퍼에서 바로 쓴다 (tmp보다 클 수 있다) */
            n = (int)(head + head_len - (end + 4));
            if (write_all(out_fd, end + 4, (size_t)n) < 0) {
                perror("https: write");
                goto fail;
            }
            body_len += (size_t)n;
            if (content_length >= 0 && body_len >= (size_t)content_length)
                break;
            continue;
        }
        if (write_all(out_fd, (const char *)tmp, (size_t)n) < 0) {
            perror("https: write");
            goto fail;
        }
        body_len += (size_t)n;
        if (content_length >= 0 && body_len >= (size_t)content_length)
            break;
    }
    close(fd);

    /* Content-Length가 있으면 길이가 맞아야 성공. 없으면 연결이 끝날 때까지 받은 것을
     * 본문으로 본다 (많은 서버가 close_notify 없이 TCP를 끊으므로 BR_ERR_IO도 허용). */
    if (!in_body)
        goto tls_fail_closed;
    if (content_length >= 0) {
        if (body_len == (size_t)content_length)
            return 0;
        fprintf(stderr, "https: 본문이 잘렸습니다 (%lu/%ld바이트)\n",
                (unsigned long)body_len, content_length);
        return -1;
    }
    err = br_ssl_engine_last_error(&sc.eng);
    if (err == BR_ERR_OK || err == BR_ERR_IO)
        return body_len > 0 ? 0 : -1;
    fprintf(stderr, "https: TLS 오류 %d\n", err);
    return -1;

tls_fail:
    close(fd);
tls_fail_closed:
    err = br_ssl_engine_last_error(&sc.eng);
    fprintf(stderr, "https: TLS 연결 실패 (BearSSL 오류 %d%s)\n", err,
            err >= BR_ERR_X509_OK && err < BR_ERR_X509_OK + 64 ? ", 인증서 검증" : "");
    return -1;

fail:
    close(fd);
    return -1;
}
