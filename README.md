[![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/DroneDB/Server">
    <img src="https://user-images.githubusercontent.com/1951843/168909537-8523662e-766d-41e6-8b9b-60f37e5f168d.png" alt="DroneDB Server">
  </a>

  <p align="center">
    A self-hosted aerial data management and sharing server.
  </p>
</div>

## What is it?

![image](https://user-images.githubusercontent.com/1951843/168910096-ed819236-4945-4c0a-bf34-5d3223961697.png)

A server to manage and share aerial data assets (aerial images, orthophotos, elevation models, point clouds, textured models, panoramas, etc.).

You can run DroneDB Server to organize aerial data, share it with others or even build custom applications on top of its API.

You provide the files, DroneDB Server handles the rest: on-demand dynamic tiling, creating thumbnails, parsing geolocation data, streaming meshes, handling metadata, geoprojecting images and many other functions.

DroneDB Server organizes your data in a straightforward filesystem structure. There's no databases, unique identifiers or other complex layers. You can always access your data from the filesystem.

Backing up your DroneDB Server is as simple as copying the entire storage folder. You can even toss away DroneDB server and you will still be able to access your data in an organized manner.

<!-- GETTING STARTED -->
## Getting Started

 * First install [docker](https://www.docker.com/). It's the only requirement.

### Linux/macOS

Download [ddb-server.sh](https://raw.githubusercontent.com/DroneDB/Server/master/ddb-server.sh) and run from a command prompt:

```
bash ddb-server.sh start
```

### Windows

Coming soon!

 * Open a browser to `http://localhost:5000` and login with the default credentials: `admin:password`.


## Set Storage Path

By default DroneDB Server will store all data in a `storage/` folder. You can change that by passing a `--storage` parameter:

```
bash ddb-server.sh start --storage /path/to/storage
```

See `bash ddb-server.sh --help` for other options.

## Run in SingleDB mode

DroneDB Server can operate in two modes: 

 * **Full**: organizations and datasets will be stored in storage path. This is the default.
 * **Single**: if storage path is a directory containing existing files, the directory will be indexed and served by the server. A single `projects` organization will exist and a single dataset will be available.

For example, if you have a folder with results from [ODM](https://github.com/OpenDroneMap/ODM), you can run:

```
bash ddb-server.sh start --storage /data/drone/brighton
```

## Roadmap

- [ ] User Management
- [ ] Native deployment on macOS
- [ ] Native deployment on Windows

See the [open issues](https://github.com/DroneDB/Server/issues) for a full list of proposed features (and known issues).

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the AGPLv3 License. See `LICENSE.txt` for more information.

[contributors-shield]: https://img.shields.io/github/contributors/DroneDB/Server.svg?style=for-the-badge
[contributors-url]: https://github.com/DroneDB/Server/graphs/contributors
[stars-shield]: https://img.shields.io/github/stars/DroneDB/Server.svg?style=for-the-badge
[stars-url]: https://github.com/DroneDB/Server/stargazers
[license-shield]: https://img.shields.io/github/license/DroneDB/Server.svg?style=for-the-badge
[license-url]: https://github.com/DroneDB/Server/blob/master/LICENSE.txt
[product-screenshot]: images/screenshot.png