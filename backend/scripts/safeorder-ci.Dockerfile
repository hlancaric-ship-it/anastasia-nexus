FROM node:24.14.0-bookworm AS node
FROM postgres:16-bookworm
ARG WAVE1_UID=1001
ARG WAVE1_GID=1001
COPY --from=node /usr/local/ /usr/local/
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid ${WAVE1_GID} wave1-ci && useradd --uid ${WAVE1_UID} --gid ${WAVE1_GID} --no-create-home --home-dir /tmp wave1-ci
ENV PATH="/usr/lib/postgresql/16/bin:${PATH}"
ENTRYPOINT []
