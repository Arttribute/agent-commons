FROM ghcr.io/searxng/searxng@sha256:854f239d5c181db9c4282cd0ffc1737a61232dd6ad0ea964028b96df17d7758a

USER root

COPY --chown=977:977 settings.yml /etc/searxng/settings.yml
COPY --chown=977:977 auth_middleware.py /usr/local/searxng/auth_middleware.py
RUN mv /usr/local/searxng/entrypoint.sh /usr/local/searxng/entrypoint.original.sh
COPY --chmod=755 entrypoint.sh /usr/local/searxng/entrypoint.sh
