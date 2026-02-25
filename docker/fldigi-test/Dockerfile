FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  fldigi \
  pulseaudio \
  pulseaudio-utils \
  alsa-utils \
  xvfb \
  xauth \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY docker/fldigi-test/start-fldigi.sh /usr/local/bin/start-fldigi.sh
COPY docker/fldigi-test/run-slow-tests.sh /usr/local/bin/run-slow-tests.sh
COPY docker/fldigi-test/asound.conf /etc/asound.conf
RUN chmod +x /usr/local/bin/start-fldigi.sh
RUN chmod +x /usr/local/bin/run-slow-tests.sh

EXPOSE 7362

CMD ["/usr/local/bin/run-slow-tests.sh"]
