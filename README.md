# South Fork Caspar Creek Data Explorer

Transforms http://fs-server.humboldt.edu/RTMC/SFCaspar_DetailView.gif into https://knoebber.github.io/caspar/

This repository is not affiliated with Jackson State Forest, Cal Poly
Humboldt, or the US forest service.


## AWS Architecture

1. Event Bridge cron job
2. Parse data in Lambda with Tesseract OCR
3. Store image in S3
4. Store data in Dynamo
