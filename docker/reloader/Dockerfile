FROM docker:27-cli

RUN apk add --no-cache bash git

COPY reload.sh /reload.sh
RUN chmod +x /reload.sh

CMD ["/reload.sh"]
