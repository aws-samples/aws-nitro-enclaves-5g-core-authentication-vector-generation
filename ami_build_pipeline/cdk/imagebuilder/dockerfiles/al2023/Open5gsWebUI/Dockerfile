FROM arm64v8/alpine:latest as DOWNLOAD
RUN apk add --update git

RUN git clone https://github.com/open5gs/open5gs.git open5gs.git

FROM arm64v8/alpine:latest as BUILD
RUN apk add --update nodejs npm
COPY --from=DOWNLOAD open5gs.git/webui .
WORKDIR "/webui"
RUN npm ci
CMD ["npm", "run", "dev"] # Use with --env DB_URI=mongodb://udm.local/open5gs (e.g. docker run --rm --name local-webui -p 3000:3000 --env DB_URI=mongodb://udm.local/open5gs -d webui:latest)
EXPOSE 3000
