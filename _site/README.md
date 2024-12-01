# Personal Website
<!--  -->

My personal website based on [Jekyll's](https://jekyllrb.com/) [al-folio](https://github.com/alshedivat/al-folio) theme.

## Getting started

For more about how to use Jekyll, check out [this tutorial](https://www.taniarascia.com/make-a-static-website-with-jekyll/).
Why Jekyll? Read [Andrej Karpathy's blog post](https://karpathy.github.io/2014/07/01/switching-to-jekyll/)!

### Installation

#### Local setup

Assuming you have [Ruby](https://www.ruby-lang.org/en/downloads/) and [Bundler](https://bundler.io/) installed on your system (*hint: for ease of managing ruby gems, consider using [rbenv](https://github.com/rbenv/rbenv)*), first [fork](https://guides.github.com/activities/forking/) the theme from `github.com:alshedivat/al-folio` to `github.com:<your-username>/<your-repo-name>` and do the following:

```bash
$ git clone git@github.com:<your-username>/<your-repo-name>.git
$ cd <your-repo-name>
$ bundle install
$ bundle exec jekyll serve
```

#### Deployment

After building locally, push all the changes. The site will be deployed frm `gh-pages` which contains local build. 

**For project pages (default):**

- Make changes, commit, and push!
- After deployment, the webpage will become available at `<your-github-username>.github.io/<your-repository-name>/`.
- The `master` branch should be used for the source code of your webpage and `gh-pages` branch (will be created on the first deployment) will be used for deployment.

**For personal and organization webpages:**
- Rename your repository to `<your-github-username>.github.io` or `<your-github-orgname>.github.io`.
- Click on **Actions** tab and **Enable GitHub Actions**; you no need to worry about creating any workflows as everything has already been set for you.
- Make sure the `url` and `baseurl` fields in `_config.yml` are empty.
- Make any other changes to your webpage, commit, and push. This will automatically trigger the **Deploy** action.
- Wait for a few minutes and let the action complete. You can see the progress in the **Actions** tab. If completed successfully, in addition to the `master` branch, your repository should now have a newly built `gh-pages` branch.
- Finally, in the **Settings**, in the Pages section, set the branch to `gh-pages` (**NOT** to `master`). See [Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#choosing-a-publishing-source) for more details.


## Customizations

1. Importance for Navbar: Pages in the navbar are sorted based on importance variable in each page. 

2. Selected News: News in the about page are selected news base on binary selected variable.

3. Year in Projects: Each project has an year variable. This will be used to sort projects. 

4. No Footer

5. Project Websites: All project webpage files will reside in `_projects/project_name/` and their assets in `assets/projects/project_name/assets/`.

6. Added a mobile version for profile picture in the `_base.scss`

  ```css
  @media (max-width: 576px) {
    .profile {
      width: 30%;
      font-size: 10px;
      .address {
        p { 
          font-size: 2px;
          display: block;
          }
      }
    }
  }
```

7. Added `_papers.scss` for styling of `bib.html` files.

## Theme Features

### Publications

Your publications page is generated automatically from your BibTex bibliography.
Simply edit `_bibliography/papers.bib`.
You can also add new `*.bib` files and customize the look of your publications however you like by editing `_pages/publications.md`.


<details><summary><strong>Author annotation:</strong></summary>

In publications, the author entry for yourself is identified by string `scholar:last_name` and string array `scholar:first_name` in `_config.yml`:
```
scholar:
  last_name: Einstein
  first_name: [Albert, A.]
```
If the entry matches the last name and one form of the first names, it will be underlined.
Keep meta-information about your co-authors in `_data/coauthors.yml` and Jekyll will insert links to their webpages automatically.
The coauthor data format in `_data/coauthors.yml` is as follows,
```
"Adams":
  - firstname: ["Edwin", "E.", "E. P.", "Edwin Plimpton"]
    url: https://en.wikipedia.org/wiki/Edwin_Plimpton_Adams

"Podolsky":
  - firstname: ["Boris", "B.", "B. Y.", "Boris Yakovlevich"]
    url: https://en.wikipedia.org/wiki/Boris_Podolsky

"Rosen":
  - firstname: ["Nathan", "N."]
    url: https://en.wikipedia.org/wiki/Nathan_Rosen

"Bach":
  - firstname: ["Johann Sebastian", "J. S."]
    url: https://en.wikipedia.org/wiki/Johann_Sebastian_Bach

  - firstname: ["Carl Philipp Emanuel", "C. P. E."]
    url: https://en.wikipedia.org/wiki/Carl_Philipp_Emanuel_Bach
```
If the entry matches one of the combinations of the last names and the first names, it will be highlighted and linked to the url provided.

</details>


### Collections

This Jekyll theme implements `collections` to let you break up your work into categories.
The theme comes with two default collections: `news` and `projects`.
Items from the `news` collection are automatically displayed on the home page.
Items from the `projects` collection are displayed on a responsive grid on projects page.

You can easily create your own collections, apps, short stories, courses, or whatever your creative work is.
To do this, edit the collections in the `_config.yml` file, create a corresponding folder, and create a landing page for your collection, similar to `_pages/projects.md`.


### Layouts

**al-folio** comes with stylish layouts for pages and blog posts.

#### The iconic style of Distill

The theme allows you to create blog posts in the [distill.pub](https://distill.pub/) style:

For more details on how to create distill-styled posts using `<d-*>` tags, please refer to [the example](https://alshedivat.github.io/al-folio/blog/2018/distill/).

#### Full support for math & code

**al-folio** supports fast math typesetting through [KaTeX](https://katex.org/) and code syntax highlighting using [GitHub style](https://github.com/jwarby/jekyll-pygments-themes):


#### Photos

Photo formatting is made simple using [Bootstrap's grid system](https://getbootstrap.com/docs/4.4/layout/grid/).
Easily create beautiful grids within your blog posts and project pages:


### Other features

#### Theming
Six beautiful theme colors have been selected to choose from.
The default is purple, but you can quickly change it by editing `$theme-color` variable in the `_sass/_themes.scss` file.
Other color variables are listed there as well.

#### Social media previews
**al-folio** supports preview images on social media.
To enable this functionality you will need to set `serve_og_meta` to `true` in your `_config.yml`.
Once you have done so, all your site's pages will include Open Graph data in the HTML head element.

You will then need to configure what image to display in your site's social media previews.
This can be configured on a per-page basis, by setting the `og_image` page variable.
If for an individual page this variable is not set, then the theme will fall back to a site-wide `og_image` variable, configurable in your `_config.yml`.
In both the page-specific and site-wide cases, the `og_image` variable needs to hold the URL for the image you wish to display in social media previews.


## License

This website is based on [al-folio](https://github.com/alshedivat/al-folio) theme which is available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).

Originally, **al-folio** was based on the [\*folio theme](https://github.com/bogoli/-folio) (published by [Lia Bogoev](http://liabogoev.com) and under the MIT license).
Since then, it got a full re-write of the styles and many additional cool features.
