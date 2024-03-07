#!/bin/bash

# CA
certtool --generate-privkey --bits 4096 --outfile ca.key.pem
certtool --generate-self-signed --load-privkey ca.key.pem --template ca_template.txt --outfile cacert.pem
certtool --verify  --infile cacert.pem --load-ca-certificate cacert.pem
# # SMF
certtool --generate-privkey --bits 4096 --outfile smf.key.pem
certtool --generate-request --template smf_template.txt --load-privkey smf.key.pem --outfile smf.localdomain.csr
certtool --generate-certificate --load-request smf.localdomain.csr --load-ca-certificate cacert.pem --load-ca-privkey ca.key.pem --template smf_template.txt --outfile smf.cert.pem
certtool --verify  --infile smf.cert.pem --load-ca-certificate cacert.pem
# # PCRF
certtool --generate-privkey --bits 4096 --outfile pcrf.key.pem
certtool --generate-request --template pcrf_template.txt --load-privkey pcrf.key.pem --outfile pcrf.localdomain.csr
certtool --generate-certificate --load-request pcrf.localdomain.csr --load-ca-certificate cacert.pem --load-ca-privkey ca.key.pem --template pcrf_template.txt --outfile pcrf.cert.pem
certtool --verify  --infile pcrf.cert.pem --load-ca-certificate cacert.pem
# # MME
certtool --generate-privkey --bits 4096 --outfile mme.key.pem
certtool --generate-request --template mme_template.txt --load-privkey mme.key.pem --outfile mme.localdomain.csr
certtool --generate-certificate --load-request mme.localdomain.csr --load-ca-certificate cacert.pem --load-ca-privkey ca.key.pem --template mme_template.txt --outfile mme.cert.pem
certtool --verify  --infile mme.cert.pem --load-ca-certificate cacert.pem
# # HSS
certtool --generate-privkey --bits 4096 --outfile hss.key.pem
certtool --generate-request --template hss_template.txt --load-privkey hss.key.pem --outfile hss.localdomain.csr
certtool --generate-certificate --load-request hss.localdomain.csr --load-ca-certificate cacert.pem --load-ca-privkey ca.key.pem --template hss_template.txt --outfile hss.cert.pem
certtool --verify  --infile hss.cert.pem --load-ca-certificate cacert.pem

sudo cp cacert.pem {smf,pcrf,mme,hss}.cert.pem {smf,pcrf,mme,hss}.key.pem /usr/local/etc/freeDiameter/
