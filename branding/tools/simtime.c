/*
 * simtime — run a simulator app at another wall-clock time.
 *
 * A simulator has no clock of its own: it reads the Mac's. The store
 * screenshots are scenes at a given date and hour (Casablanca, Tuesday
 * 13 October, the afternoon after Asr), so this shifts CLOCK_REALTIME —
 * and only it — by MIHRAB_TIME_OFFSET seconds for the one app it is
 * injected into:
 *
 *   SIMCTL_CHILD_DYLD_INSERT_LIBRARIES=/path/simtime.dylib \
 *   SIMCTL_CHILD_MIHRAB_TIME_OFFSET=-1036800 \
 *   xcrun simctl launch <udid> com.hassan.prayerapp
 *
 * Monotonic clocks are left alone, so timers, animations and the
 * countdown's ticking are untouched; the clock simply reads the scene's
 * time and keeps running from it.
 */
#include <stdint.h>
#include <stdlib.h>
#include <sys/time.h>
#include <time.h>

static long long offset_ns;

__attribute__((constructor)) static void simtime_init(void) {
  const char *s = getenv("MIHRAB_TIME_OFFSET");
  if (s) offset_ns = strtoll(s, NULL, 10) * 1000000000LL;
}

static int simtime_clock_gettime(clockid_t id, struct timespec *tp) {
  int r = clock_gettime(id, tp);
  if (r == 0 && tp && id == CLOCK_REALTIME) {
    long long ns = (long long)tp->tv_sec * 1000000000LL + tp->tv_nsec + offset_ns;
    tp->tv_sec = ns / 1000000000LL;
    tp->tv_nsec = ns % 1000000000LL;
  }
  return r;
}

static int simtime_gettimeofday(struct timeval *tv, void *tz) {
  int r = gettimeofday(tv, tz);
  if (r == 0 && tv) {
    long long us = (long long)tv->tv_sec * 1000000LL + tv->tv_usec + offset_ns / 1000;
    tv->tv_sec = us / 1000000LL;
    tv->tv_usec = (int)(us % 1000000LL);
  }
  return r;
}

static time_t simtime_time(time_t *t) {
  time_t r = time(NULL) + (time_t)(offset_ns / 1000000000LL);
  if (t) *t = r;
  return r;
}

static uint64_t simtime_clock_gettime_nsec_np(clockid_t id) {
  uint64_t v = clock_gettime_nsec_np(id);
  if (id == CLOCK_REALTIME) v += offset_ns;
  return v;
}

__attribute__((used)) static struct {
  const void *replacement;
  const void *original;
} interposers[] __attribute__((section("__DATA,__interpose"))) = {
    {(const void *)simtime_clock_gettime, (const void *)clock_gettime},
    {(const void *)simtime_gettimeofday, (const void *)gettimeofday},
    {(const void *)simtime_time, (const void *)time},
    {(const void *)simtime_clock_gettime_nsec_np, (const void *)clock_gettime_nsec_np},
};
