[![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="left">
  <a href="https://github.com/DroneDB/Server">
    <img src="https://user-images.githubusercontent.com/1951843/168663747-3118afa5-81ee-40a8-a03d-8589bea6a64b.png" alt="DroneDB Server">
  </a>

  <p align="left">
    No fuss aerial data management and sharing server.
  </p>
</div>

## What is this?

A server to manage and share aerial data assets (aerial images, orthophotos, elevation models, point clouds, textured models, panoramas, etc.).

You can run DroneDB Server to organize aerial data within your organization, share it with others or even build entirely custom applications with it. 

You provide the files, DroneDB Server handles the rest. It exposes on-demand dynamic tiling, creating thumbnails, parsing EXIF data, streaming meshes, handling metadata, geoprojecting images and many other functions.

DroneDB Server also doesn't mess with your data! Files and folders are organized in a normal filesystem structure; there's no databases, unique identifiers or other complex layers. You can always access your data from the filesystem. 

Backing up your DroneDB Server is as simple as copying the entire storage folder. You can even toss away DroneDB server and you will still be able to access your data in an organized manner.

<!-- GETTING STARTED -->
## Getting Started

If you have [docker](https://www.docker.com/) installed you can run:

```
docker run dronedb/server -p 5000:5000
```

## Roadmap

- [ ] User Management
- [ ] Native deployment on macOS

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