# wrtcft
WebRtc file transfer

## Start server

```
node index.js server
```

## Send file

```
node index.js send test_file --transferId=abc
```

## Receive file

```
node index.js receive abc out_file
```